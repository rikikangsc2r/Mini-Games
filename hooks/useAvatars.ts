import { useState, useEffect } from 'react';

export interface Avatar {
  name: string;
  url: string;
}

// Use jsdelivr CDN to avoid CORS issues when fetching from a browser.
const AVATAR_JSON_URL = 'https://cdn.jsdelivr.net/gh/rikikangsc2-eng/SVG-ICON@main/avatar.json';
const GITHUB_RAW_BASE = 'https://github.com/rikikangsc2-eng/SVG-ICON/raw/refs/heads/main/';
const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/gh/rikikangsc2-eng/SVG-ICON@main/';


// Cache sederhana untuk menghindari fetch berulang
let avatarCache: Avatar[] | null = null;

export const useAvatars = () => {
  const [avatars, setAvatars] = useState<Avatar[]>(avatarCache || []);
  const [loading, setLoading] = useState<boolean>(!avatarCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Jika sudah ada di cache, tidak perlu fetch lagi
    if (avatarCache) {
      return;
    }

    const fetchAvatars = async () => {
      try {
        setLoading(true);
        const response = await fetch(AVATAR_JSON_URL);
        if (!response.ok) {
          throw new Error(`Gagal mengambil file avatar: status ${response.status}`);
        }
        const data: Record<string, string> = await response.json();
        
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new Error('Format respons avatar tidak terduga');
        }
        
        // Transform URLs to use the CDN as well, preventing potential CORS issues on images.
        const avatarList: Avatar[] = Object.entries(data).map(([key, url]) => ({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            url: url.replace(GITHUB_RAW_BASE, JSDELIVR_BASE),
        }));
        
        avatarCache = avatarList;
        setAvatars(avatarList);
        setError(null);
      } catch (e: any)
 {
        console.error("Gagal mengambil avatar:", e);
        setError('Gagal memuat avatar. Coba lagi nanti.');
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, []); // Hanya dijalankan sekali saat komponen pertama kali dimuat

  return { avatars, loading, error };
};
