import axios from 'axios';

type DesignType = 'instagram_post' | 'instagram_story' | 'reel_thumbnail';

export async function createDesignFromText(params: {
  accessToken: string;
  designTitle: string;
  designType: DesignType;
  brandColors: string[];
  headline: string;
  bodyText: string;
}): Promise<{ designId: string; editUrl: string; exportUrl?: string }> {
  const { accessToken, designTitle, designType } = params;

  const res = await axios.post(
    'https://api.canva.com/rest/v1/designs',
    {
      design: {
        design_type: { type: designType },
        title: designTitle,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    designId: res.data?.design?.id || '',
    editUrl: res.data?.design?.urls?.edit_url || `https://www.canva.com/design/${res.data?.design?.id}/edit`,
    exportUrl: undefined,
  };
}

export async function exportDesign(params: {
  accessToken: string;
  designId: string;
  format: 'png' | 'jpg';
}): Promise<{ downloadUrl: string }> {
  const { accessToken, designId, format } = params;

  // Start export
  const exportRes = await axios.post(
    'https://api.canva.com/rest/v1/exports',
    {
      design_id: designId,
      format: { type: format },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const exportId = exportRes.data?.job?.id;
  if (!exportId) throw new Error('Failed to start Canva export.');

  // Poll until complete
  const start = Date.now();
  const timeoutMs = 5 * 60 * 1000;

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));

    const statusRes = await axios.get(
      `https://api.canva.com/rest/v1/exports/${exportId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const status = statusRes.data?.job?.status;
    if (status === 'success') {
      const urls = statusRes.data?.job?.urls;
      return { downloadUrl: urls?.[0] || '' };
    }
    if (status === 'failed') {
      throw new Error('Canva export failed.');
    }
  }

  throw new Error('Timed out waiting for Canva export.');
}

export function buildCanvaDeepLink(params: {
  platform: string;
  headline: string;
  bodyText: string;
}): string {
  const typeMap: Record<string, string> = {
    instagram: 'Instagram-Post',
    twitter: 'Twitter-Post',
    linkedin: 'LinkedIn-Post',
    tiktok: 'TikTok-Video',
    facebook: 'Facebook-Post',
  };
  const designType = typeMap[params.platform] || 'Instagram-Post';
  const title = encodeURIComponent(params.headline || 'New Design');
  const content = encodeURIComponent(params.bodyText || '');
  return `https://www.canva.com/create/${designType.toLowerCase()}/?title=${title}&content=${content}`;
}
