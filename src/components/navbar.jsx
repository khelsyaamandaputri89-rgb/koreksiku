function Navbar() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">

      <div className="flex items-center gap-3">

        <button className="md:hidden text-2xl">
          ☰
        </button>

        <h2 className="text-lg font-semibold text-gray-800">
          KoreksiKu
        </h2>

      </div>

      <div className="flex items-center gap-3">

        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
          👤
        </div>

        <span className="hidden sm:block text-sm font-medium text-gray-700">
          Guru
        </span>

      </div>

    </header>
  )
}

export default Navbar