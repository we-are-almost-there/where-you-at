import { Routes, Route } from "react-router";
import { Home } from "./features/home";
import { CourseExplore, CourseDetail } from "./features/map";
import { Support } from "./features/support";
import { Race } from "./features/race";
import { BicycleExplore } from "./features/bicycle";
import { ContactPage, FaqPage, HelpPage, NoticeDetail, NoticeList, PrivacyPage, TermsPage } from "./features/help";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/courses" element={<CourseExplore />} />
      <Route path="/courses/:id" element={<CourseDetail />} />
      <Route path="/support" element={<Support />} />
      <Route path="/races" element={<Race />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/notices" element={<NoticeList />} />
      <Route path="/notices/:id" element={<NoticeDetail />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/bicycle-facilities" element={<BicycleExplore />} />
    </Routes>
  );
}

export default App;
