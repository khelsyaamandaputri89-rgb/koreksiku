function Sidebar() {

  return (

    <aside className="hidden md:block w-64 min-h-screen bg-white border-r border-gray-200 p-5">

      <h1 className="text-2xl font-bold text-gray-800 mb-8">
        KoreksiKu
      </h1>

      <nav className="space-y-2">

        <a
          href="/dashboard"
          className="block px-4 py-3 rounded-lg hover:bg-gray-100"
        >
          🏠 Dashboard
        </a>

        <a
          href="/questions"
          className="block px-4 py-3 rounded-lg hover:bg-gray-100"
        >
          📝 Soal
        </a>

        <a
          href="/answer-sheet"
          className="block px-4 py-3 rounded-lg hover:bg-gray-100"
        >
          🖨️ Cetak LJK
        </a>

        <a
          href="/correction"
          className="block px-4 py-3 rounded-lg hover:bg-gray-100"
        >
          📷 Koreksi
        </a>

        <a
          href="/history"
          className="block px-4 py-3 rounded-lg hover:bg-gray-100"
        >
          📊 Riwayat
        </a>

      </nav>

    </aside>

  )
}

export default Sidebar