import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"

import Dashboard from "./pages/dashboard"
import Questions from "./pages/questions"
import CreateQuestion from "./pages/createQuestion"
import Correction from "./pages/correction"
import DashboardLayout from "./layouts/dashboardLayout"
import Login from "./pages/login"
import Register from "./pages/register"
import ProtectedRoute from "./components/protectedRoute"
import AnswerSheet from "./pages/answerSheet"

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route path="/" element={<Navigate to="/login" />} />

        
          <Route
            path="register"
            element={<Register />}
          />

          
          <Route
            path="login"
            element={<Login />}
          />

        <Route path="/" element={<Navigate to="/dashboard" />} />

        <Route element={<DashboardLayout />}>

          <Route
            path="/dashboard"
            element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
            }
          />

          <Route
            path="/answer-sheet"
            element={
              <ProtectedRoute>
                <AnswerSheet />
              </ProtectedRoute>
            }
          />

          <Route
            path="/questions"
            element={
            <ProtectedRoute>
              <Questions />
            </ProtectedRoute>
            }
          />

          <Route
            path="/questions/create"
            element={
            <ProtectedRoute>
              <CreateQuestion />
            </ProtectedRoute>
            }
          />

          <Route
            path="/correction"
            element={
            <ProtectedRoute>
              <Correction />
            </ProtectedRoute>
            }
          />

        </Route>

      </Routes>

    </BrowserRouter>
  )
}

export default App