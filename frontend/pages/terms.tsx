import { TermsPage } from '../src/pages/TermsPage';
import { useNextNavigate } from '../src/nextNavigation';

export default function Terms() {
  const navigate = useNextNavigate();
  return <TermsPage currentRoute="/terms" navigate={navigate} />;
}
