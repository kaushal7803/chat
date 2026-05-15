import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { connectDB } from './db';
import User from '@/models/User';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return false;

      try {
        await connectDB();
        await User.findOneAndUpdate(
          { googleId: account.providerAccountId },
          {
            email: user.email,
            name: user.name,
            image: user.image,
            googleId: account.providerAccountId,
          },
          { upsert: true, new: true }
        );
        return true;
      } catch (error) {
        console.error('SignIn error:', error);
        return false;
      }
    },
    async jwt({ token, account }) {
      // Persist the user's MongoDB _id in the token
      if (account) {
        await connectDB();
        const dbUser = await User.findOne({ googleId: account.providerAccountId });
        if (dbUser) token.userId = dbUser._id.toString();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as any).id = token.userId;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',        // Redirect to home page for sign-in
    error: '/',         // Redirect errors to home
  },
  secret: process.env.NEXTAUTH_SECRET,
};
