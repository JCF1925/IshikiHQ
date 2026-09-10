import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    authTime?: number;
    user: {
      id: string;
      role?: string;
      // Add custom fields here
    } & DefaultSession['user']; // includes name, email, image
  }

  interface User {
    id: string;
    role?: string;
    // Mirror any fields added to Session['user'] above
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    authTime?: number;
    role?: string;
  }
}
