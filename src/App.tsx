import { Routes, Route } from "react-router";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Experiments from "@/pages/Experiments";
import ExperimentDetail from "@/pages/ExperimentDetail";
import Samples from "@/pages/Samples";
import SampleDetail from "@/pages/SampleDetail";
import Storage from "@/pages/Storage";
import BoxDetail from "@/pages/BoxDetail";
import Sequences from "@/pages/Sequences";
import Equipment from "@/pages/Equipment";
import EquipmentDetail from "@/pages/EquipmentDetail";
import Workflows from "@/pages/Workflows";
import WorkflowEditor from "@/pages/WorkflowEditor";
import ActivityLog from "@/pages/ActivityLog";
import SearchResults from "@/pages/SearchResults";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/experiments" element={<Experiments />} />
              <Route path="/experiments/:id" element={<ExperimentDetail />} />
              <Route path="/samples" element={<Samples />} />
              <Route path="/samples/:id" element={<SampleDetail />} />
              <Route path="/storage" element={<Storage />} />
              <Route path="/storage/box/:id" element={<BoxDetail />} />
              <Route path="/sequences" element={<Sequences />} />
              <Route path="/equipment" element={<Equipment />} />
              <Route path="/equipment/:id" element={<EquipmentDetail />} />
              <Route path="/workflows" element={<Workflows />} />
              <Route path="/workflows/:id" element={<WorkflowEditor />} />
              <Route path="/activity" element={<ActivityLog />} />
              <Route path="/search" element={<SearchResults />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        }
      />
    </Routes>
  );
}
