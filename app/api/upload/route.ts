import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Convert Web Blob to Node Buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Sanitize name and ensure uniqueness
    const originalName = (file as any).name || 'uploaded_file';
    const cleanName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const filename = `${Date.now()}_${cleanName}`;

    // Target directory path inside public directory
    const publicDir = join(process.cwd(), 'public');
    const uploadDir = join(publicDir, 'uploads');

    // Create directory recursively if missing
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Write to disk
    const finalPath = join(uploadDir, filename);
    await writeFile(finalPath, buffer);

    // Determine return file classification ('image' vs generic 'file')
    const contentType = file.type || '';
    const fileType = contentType.startsWith('image/') ? 'image' : 'file';

    // Return public relative URL
    return NextResponse.json({ 
      url: `/uploads/${filename}`,
      originalName,
      fileType
    }, { status: 201 });
  } catch (error) {
    console.error('Upload failure:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
