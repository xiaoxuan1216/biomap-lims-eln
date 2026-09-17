import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const Experiments = lazy(() => import("@/pages/Experiments"));
const ExperimentDetail = lazy(() => import("@/pages/ExperimentDetail"));
const Samples = lazy(() => import("@/pages/Samples"));
const SampleDetail = lazy(() => import("@/pages/SampleDetail"));
const SampleLineage = lazy(() => import("@/pages/SampleLineage"));
const Storage = lazy(() => import("@/pages/Storage"));
const BoxDetail = lazy(() => import("@/pages/BoxDetail"));
const Sequences = lazy(() => import("@/pages/Sequences"));
const Equipment = lazy(() => import("@/pages/Equipment"));
const EquipmentDetail = lazy(() => import("@/pages/EquipmentDetail"));
const DriverCenter = lazy(() => import("@/pages/DriverCenter"));
const Workflows = lazy(() => import("@/pages/Workflows"));
const WorkflowEditor = lazy(() => import("@/pages/WorkflowEditor"));
const CloningPlanner = lazy(() => import("@/pages/CloningPlanner"));
const ActivityLog = lazy(() => import("@/pages/ActivityLog"));
const SearchResults = lazy(() => import("@/pages/SearchResults"));
const LabAgent = lazy(() => import("@/pages/LabAgent"));
const InstrumentAgent = lazy(() => import("@/pages/InstrumentAgent"));
const ExternalOrders = lazy(() => import("@/pages/ExternalOrders"));
const ExternalOrderDetail = lazy(() => import("@/pages/ExternalOrderDetail"));
const SampleRequests = lazy(() => import("@/pages/SampleRequests"));
const SampleRequestDetail = lazy(() => import("@/pages/SampleRequestDetail"));
const LabRuns = lazy(() => import("@/pages/LabRuns"));
const LabRunLaunch = lazy(() => import("@/pages/LabRunLaunch"));
const LabRunDetail = lazy(() => import("@/pages/LabRunDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {import.meta.env.DEV && (
        <Route
          path="/instrument-agent-preview"
          element={
            <div className="min-h-screen bg-background p-4 md:p-6">
              <div className="mx-auto max-w-[1600px]">
                <InstrumentAgent mode="demo" />
              </div>
            </div>
          }
        />
      )}
      <Route
        path="/*"
        element={
          <AppLayout>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/lab-agent" element={<LabAgent />} />
                <Route path="/instrument-agent" element={<InstrumentAgent />} />
                <Route path="/runs" element={<LabRuns />} />
                <Route path="/runs/new" element={<LabRunLaunch />} />
                <Route path="/runs/:id" element={<LabRunDetail />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/experiments" element={<Experiments />} />
                <Route path="/experiments/:id" element={<ExperimentDetail />} />
                <Route path="/samples" element={<Samples />} />
                <Route path="/samples/:id" element={<SampleDetail />} />
                <Route path="/samples/:id/lineage" element={<SampleLineage />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/storage/box/:id" element={<BoxDetail />} />
                <Route path="/sequences" element={<Sequences />} />
                <Route path="/equipment" element={<Equipment />} />
                <Route path="/equipment/:id" element={<EquipmentDetail />} />
                <Route path="/drivers" element={<DriverCenter />} />
                <Route path="/workflows" element={<Workflows />} />
                <Route path="/cloning-planner" element={<CloningPlanner />} />
                <Route path="/workflows/:id" element={<WorkflowEditor />} />
                <Route path="/external-orders" element={<ExternalOrders />} />
                <Route path="/external-orders/:id" element={<ExternalOrderDetail />} />
                <Route path="/sample-requests" element={<SampleRequests />} />
                <Route path="/sample-requests/:id" element={<SampleRequestDetail />} />
                <Route path="/activity" element={<ActivityLog />} />
                <Route path="/search" element={<SearchResults />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppLayout>
        }
      />
    </Routes>
  );
}
