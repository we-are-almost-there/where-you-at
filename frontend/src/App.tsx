import { Routes, Route } from "react-router";
import { CourseExplore, CourseDetail } from "./features/map";
import { SupportList, SupportDetail } from "./features/support";

function App() {
  return (
    <Routes>
      <Route path="/" element={<CourseExplore />} />
      <Route path="/courses/:id" element={<CourseDetail />} />
      <Route path="/support" element={<SupportList />} />
      <Route path="/support/:id" element={<SupportDetail />} />
    </Routes>
  );
}

export default App;