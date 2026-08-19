function Navbar() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h2 className="text-lg font-semibold text-gray-800">
        Dashboard
      </h2>

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
          👤
        </div>

        <span className="text-sm font-medium text-gray-700">
          Guru
        </span>
      </div>
    </header>
  )
}

export default Navbar