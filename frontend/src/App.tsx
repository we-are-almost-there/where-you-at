import { Routes, Route } from "react-router";
import { Home } from "./features/home";
import { CourseExplore, CourseDetail } from "./features/map";
import { Support } from "./features/support";
import { Race } from "./features/race";
import { BicycleExplore } from "./features/bicycle";
import { FaqPage, HelpPage, NoticeDetail, NoticeList } from "./features/help";
import PlaceholderPage from "./components/layout/PlaceholderPage";

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
      <Route path="/terms" element={<PlaceholderPage title="이용약관" />} />
      <Route path="/privacy" element={<PlaceholderPage title="개인정보처리방침" />} />
      <Route path="/contact" element={<PlaceholderPage title="1:1 문의" />} />
      <Route path="/bicycle-facilities" element={<BicycleExplore />} />
    </Routes>
  );
}

export default App;
