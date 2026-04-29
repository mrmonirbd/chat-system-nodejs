import { HomePage } from '../src/pages/HomePage';
import { useNextNavigate } from '../src/nextNavigation';

export default function Home() {
  const navigate = useNextNavigate();
  return <HomePage currentRoute="/" navigate={navigate} />;
}
