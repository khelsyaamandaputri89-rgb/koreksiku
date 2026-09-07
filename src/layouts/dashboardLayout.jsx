import { useState } from "react"
import { Outlet } from "react-router-dom"

import Sidebar from "../components/sidebar"
import Navbar from "../components/navbar"

function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0">
        <Navbar
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="p-6">
          <Outlet />
        </main>
      </div>

    </div>
  )
}

export default DashboardLayout