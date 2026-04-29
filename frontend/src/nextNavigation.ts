import { useRouter } from 'next/router';

export function useNextNavigate() {
  const router = useRouter();

  return (path: string) => {
    if (path.startsWith('#')) {
      document.querySelector(path)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    router.push(path);
  };
}
