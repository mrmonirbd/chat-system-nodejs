import { AboutPage } from '../src/pages/AboutPage';
import { useNextNavigate } from '../src/nextNavigation';

export default function About() {
  const navigate = useNextNavigate();
  return <AboutPage currentRoute="/about" navigate={navigate} />;
}
