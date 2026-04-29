import { PrivacyPage } from '../src/pages/PrivacyPage';
import { useNextNavigate } from '../src/nextNavigation';

export default function Privacy() {
  const navigate = useNextNavigate();
  return <PrivacyPage currentRoute="/privacy" navigate={navigate} />;
}
