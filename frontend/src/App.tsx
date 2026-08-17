import { Routes, Route } from "react-router";
import { Home } from "./features/home";
import { CourseExplore, CourseDetail } from "./features/map";
import { Support } from "./features/support";
import { Race } from "./features/race";
import HelpPage from "./components/help/HelpPage";
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
      <Route path="/notices" element={<PlaceholderPage title="공지사항" />} />
      <Route path="/faq" element={<PlaceholderPage title="자주 묻는 질문" />} />
      <Route path="/terms" element={<PlaceholderPage title="이용약관" />} />
      <Route path="/privacy" element={<PlaceholderPage title="개인정보처리방침" />} />
      <Route path="/contact" element={<PlaceholderPage title="1:1 문의" />} />
    </Routes>
  );
}

export default App;
