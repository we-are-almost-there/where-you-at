import { Routes, Route } from "react-router";
import { CourseExplore, CourseDetail } from "./features/map";
import { Nearby } from "./features/nearby";
import { Support } from "./features/support";

function App() {
  return (
    <Routes>
      <Route path="/" element={<CourseExplore />} />
      <Route path="/courses/:id" element={<CourseDetail />} />
      <Route path="/nearby" element={<Nearby />} />
      <Route path="/support" element={<Support />} />
    </Routes>
  );
}

export default App;