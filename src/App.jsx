import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"

import Dashboard from "./pages/dashboard"
import Questions from "./pages/questions"
import CreateQuestion from "./pages/createQuestion"
import Correction from "./pages/correction"
import History from "./pages/history"

import DashboardLayout from "./layouts/dashboardLayout"

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route path="/" element={<Navigate to="/dashboard" />} />

        <Route element={<DashboardLayout />}>

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/questions"
            element={<Questions />}
          />

          <Route
            path="/questions/create"
            element={<CreateQuestion />}
          />

          <Route
            path="/correction"
            element={<Correction />}
          />

          <Route
            path="/history"
            element={<History />}
          />

        </Route>

      </Routes>

    </BrowserRouter>
  )
}

export default App