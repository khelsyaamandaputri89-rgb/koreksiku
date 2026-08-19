import { Outlet } from "react-router-dom"
import Sidebar from "../components/sidebar"
import Navbar from "../components/navbar"

function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">

      <Sidebar />

      <div className="flex-1">

        <Navbar />

        <main className="p-6">
          <Outlet />
        </main>

      </div>

    </div>
  )
}

export default DashboardLayout