function Sidebar({ isOpen, onClose }) {
  return (
    <>
      {/* Overlay khusus HP */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed md:static
          top-0 left-0
          z-50
          w-64 min-h-screen
          bg-white border-r border-gray-200 p-5
          transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Tombol tutup di HP */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            KoreksiKu
          </h1>

          <button
            onClick={onClose}
            className="md:hidden text-2xl text-gray-600"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-2">
          <a
            href="/dashboard"
            onClick={onClose}
            className="block px-4 py-3 rounded-lg hover:bg-gray-100"
          >
            🏠 Dashboard
          </a>

          <a
            href="/questions"
            onClick={onClose}
            className="block px-4 py-3 rounded-lg hover:bg-gray-100"
          >
            📝 Soal
          </a>

          <a
            href="/answer-sheet"
            onClick={onClose}
            className="block px-4 py-3 rounded-lg hover:bg-gray-100"
          >
            🖨️ Cetak LJK
          </a>

          <a
            href="/correction"
            onClick={onClose}
            className="block px-4 py-3 rounded-lg hover:bg-gray-100"
          >
            📷 Koreksi
          </a>
        </nav>
      </aside>
    </>
  )
}

export default Sidebar