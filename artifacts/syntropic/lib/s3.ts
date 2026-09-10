import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { createS3Client, getBucketConfig } from "./aws-config";

function shouldServeInline(contentType: string): boolean {
  return (
    (contentType.startsWith("image/") && contentType !== "image/svg+xml") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/")
  );
}

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: false,
  integrity: { byteSize: number; checksumSha256Base64: string },
) {
  if (isPublic) throw new Error("Public presigned uploads are not permitted");
  if (
    !Number.isInteger(integrity.byteSize) ||
    integrity.byteSize <= 0 ||
    integrity.byteSize > 25 * 1024 * 1024
  ) throw new Error("Upload size is outside the permitted range");
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(integrity.checksumSha256Base64) ||
    Buffer.from(integrity.checksumSha256Base64, "base64").byteLength !== 32
  ) {
    throw new Error("A valid SHA-256 checksum is required");
  }
  if (fileName.startsWith("/") || fileName.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Unsafe upload key");
  }
  const s3 = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${randomUUID()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
    ContentLength: integrity.byteSize,
    ChecksumSHA256: integrity.checksumSha256Base64,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  return { uploadUrl, cloud_storage_path };
}

export async function verifyUploadedFile(cloudStoragePath: string, expectedByteSize: number, expectedChecksumBase64: string) {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  const metadata = await s3.send(new HeadObjectCommand({
    Bucket: bucketName,
    Key: cloudStoragePath,
    ChecksumMode: "ENABLED",
  }));
  return metadata.ContentLength === expectedByteSize && metadata.ChecksumSHA256 === expectedChecksumBase64;
}

export async function getFileUrl(
  cloud_storage_path: string,
  contentType: string,
  isPublic: boolean,
  expiresIn = 3600,
) {
  const { bucketName } = getBucketConfig();
  if (isPublic) {
    const region = process.env.AWS_REGION ?? "us-east-1";
    const encodedPath = cloud_storage_path
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `https://${bucketName}.s3.${region}.amazonaws.com/${encodedPath}`;
  }
  const s3 = createS3Client();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ResponseContentDisposition: shouldServeInline(contentType)
      ? "inline"
      : "attachment",
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteFile(cloud_storage_path: string) {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  await s3.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: cloud_storage_path })
  );
}

export async function storePrivateFile(
  userId: string,
  category: string,
  fileName: string,
  contentType: string,
  body: Uint8Array,
  checksumSha256Base64?: string,
) {
  const s3 = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cloud_storage_path = `${folderPrefix}uploads/${userId}/${category}/${randomUUID()}-${safeName}`;
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    Body: body,
    ContentType: contentType,
    ContentLength: body.byteLength,
    ServerSideEncryption: "AES256",
    ...(checksumSha256Base64 ? { ChecksumSHA256: checksumSha256Base64 } : {}),
  }));
  return cloud_storage_path;
}

export async function initiateMultipartUpload(
  fileName: string,
  contentType: string,
  isPublic: boolean
) {
  const s3 = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? `${folderPrefix}public/uploads` : `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${Date.now()}-${fileName}`;

  const command = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
  });
  const result = await s3.send(command);
  return { uploadId: result.UploadId, cloud_storage_path };
}

export async function getPresignedUrlForPart(
  cloud_storage_path: string,
  uploadId: string,
  partNumber: number
) {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  cloud_storage_path: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
) {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  );
}
