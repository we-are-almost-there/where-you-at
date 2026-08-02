import { Routes, Route } from "react-router";
import { CourseExplore, CourseDetail } from "./features/map";
import { Support } from "./features/support";
import { Race } from "./features/race";


function App() {
  return (
    <Routes>
      <Route path="/" element={<CourseExplore />} />
      <Route path="/courses/:id" element={<CourseDetail />} />
      <Route path="/support" element={<Support />} />
      <Route path="/races" element={<Race />} />
    </Routes>
  );
}

export default App;