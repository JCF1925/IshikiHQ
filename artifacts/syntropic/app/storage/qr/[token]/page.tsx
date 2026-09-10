'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Lock, AlertTriangle, Package, MapPin, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';

export default function QRDetailPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{status: number, message: string} | null>(null);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    if (!token) return;

    const fetchItem = async () => {
      try {
        const res = await fetch(`/api/storage/qr/${token}`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          throw { status: res.status, message: await res.text() || 'Failed to fetch item' };
        }
        const itemData = await res.json();
        setData(itemData);
         setQrUrl(window.location.href);
      } catch (err: any) {
        setError({ status: err.status || 500, message: err.message || 'An error occurred' });
      } finally {
        setLoading(false);
      }
    };

    fetchItem();
  }, [token, router]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-4 text-primary animate-pulse">
          <Box className="h-10 w-10" />
          <p className="font-medium">Locating storage record...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 bg-muted/20">
        <Card className="max-w-md w-full shadow-lg border-destructive/20">
          <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
            <div className="h-16 w-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-2">
              {error.status === 403 ? <Lock className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
            </div>
            <h2 className="text-2xl font-bold">
              {error.status === 404 ? 'Storage Record Not Found' : error.status === 403 ? 'Access Denied' : 'Error'}
            </h2>
            <p className="text-muted-foreground">
              {error.status === 404 
                ? 'This QR code is invalid, revoked, or its storage record has been deleted.'
                : error.status === 403 
                  ? 'You do not have permission to view this household\'s inventory.' 
                  : error.message}
            </p>
            <Button className="mt-4" onClick={() => router.push('/storage')}>
              Go to My Storage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/20 py-8 px-4 sm:px-6">
      <div className="max-w-xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push('/storage')} className="gap-1.5 text-muted-foreground">
            <Box className="h-4 w-4" /> My Storage
          </Button>
          <div className="text-xs font-semibold uppercase tracking-wider text-primary/70 bg-primary/10 px-3 py-1 rounded-full">
            Ishiki Deep Link
          </div>
        </div>
        
        <Card className="shadow-lg border-primary/20 overflow-hidden">
          <div className="h-3 w-full bg-primary" />
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start gap-4">
              <div>
                <CardTitle className="text-3xl font-bold tracking-tight">{data.type === 'container' ? data.container.name : data.item.name}</CardTitle>
                {(data.type === 'container' ? data.container.description : data.item.description) && (
                  <CardDescription className="text-base mt-2">{data.type === 'container' ? data.container.description : data.item.description}</CardDescription>
                )}
              </div>
              <div className="rounded-xl border bg-white p-2 shadow-sm shrink-0" aria-label="Scannable link for this storage item">
                {qrUrl ? (
                  <QRCodeSVG
                    value={qrUrl}
                    size={88}
                    level="M"
                    marginSize={1}
                    title="Storage item QR code"
                  />
                ) : (
                  <Box className="h-12 w-12 p-3 text-primary" />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pb-8">
            {data.type === 'item' && data.item.labels && data.item.labels.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" /> Labels
                </h4>
                <div className="flex flex-wrap gap-2">
                  {data.item.labels.map((label: { value: string, id: string }) => (
                    <span key={label.id || label.value} className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-secondary text-secondary-foreground">
                      {label.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-3 pt-4 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</h4>
              
              <div className="flex flex-col gap-3">
                {data.location && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-card border shadow-sm">
                    <div className="mt-0.5 bg-primary/10 p-1.5 rounded text-primary">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold">{data.location.name}</div>
                      {data.location.description && <div className="text-sm text-muted-foreground">{data.location.description}</div>}
                    </div>
                  </div>
                )}
                
                {data.container && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-card border shadow-sm relative overflow-hidden">
                    <div className="absolute left-6 top-[-10px] w-0.5 h-4 bg-border" />
                    <div className="mt-0.5 bg-primary/10 p-1.5 rounded text-primary">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold">{data.container.name}</div>
                      {data.container.positionText && <div className="text-sm text-muted-foreground">Position: {data.container.positionText}</div>}
                    </div>
                  </div>
                )}
                
                {!data.location && !data.container && (
                  <div className="text-sm text-muted-foreground italic p-3 rounded-lg border bg-muted/30">
                    No specific location details saved.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
