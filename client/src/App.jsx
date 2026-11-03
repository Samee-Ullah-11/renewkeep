import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Auth from "./pages/Auth.jsx";
import Verify from "./pages/Verify.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Items from "./pages/Items.jsx";
import ItemForm from "./pages/ItemForm.jsx";
import ItemDetail from "./pages/ItemDetail.jsx";
import ImportCsv from "./pages/ImportCsv.jsx";
import Team from "./pages/Team.jsx";
import Settings from "./pages/Settings.jsx";
import InviteAccept from "./pages/InviteAccept.jsx";
import AppLayout from "./components/AppLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/verify/:token" element={<Verify />} />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="items" element={<Items />} />
        <Route path="items/new" element={<ItemForm />} />
        <Route path="items/import" element={<ImportCsv />} />
        <Route path="items/:id" element={<ItemDetail />} />
        <Route path="items/:id/edit" element={<ItemForm />} />
        <Route path="team" element={<Team />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
