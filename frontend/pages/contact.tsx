import { ContactPage } from '../src/pages/ContactPage';
import { useNextNavigate } from '../src/nextNavigation';

export default function Contact() {
  const navigate = useNextNavigate();
  return <ContactPage currentRoute="/contact" navigate={navigate} />;
}
