import { useEffect, useRef, useState } from "react"
import { supabase } from "../services/supabase"

function correction() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState("")
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState(null)

  const [studentAnswers, setStudentAnswers] = useState({})
  const [correctionResult, setCorrectionResult] = useState(null)
  const [studentName, setStudentName] = useState("")
  const [calibratePoint, setCalibratePoint] = useState(null)

  useEffect(() => {
    fetchExams()

    return () => {
      stopCameraTracks()
    }
  }, [])

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOpen])

  // =========================
  // AMBIL DATA UJIAN
  // =========================

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error mengambil ujian:", error)
      return
    }

    setExams(data || [])
  }

  // =========================
  // AMBIL KUNCI JAWABAN
  // =========================

  const getAnswerKey = async () => {
    const { data, error } = await supabase
      .from("answer_keys")
      .select("*")
      .eq("question_id", selectedExam)
      .order("question_number", { ascending: true })

    if (error) {
      console.error("Error mengambil kunci jawaban:", error)
      return []
    }

    // =========================
    // HAPUS DUPLIKAT question_number
    // Kalau ada nomor yang kembar,
    // ambil baris terakhir saja.
    // =========================

    const uniqueMap = new Map()

    ;(data || []).forEach((row) => {
      uniqueMap.set(row.question_number, row)
    })

    const uniqueKeys = Array.from(uniqueMap.values()).sort(
      (a, b) => a.question_number - b.question_number
    )

    return uniqueKeys
  }

  // =========================
  // HITUNG HASIL
  // =========================

  const calculateResult = (studentAnswers, answerKeys) => {
    let correct = 0
    let wrong = 0
    let empty = 0

    const details = []

    answerKeys.forEach((key) => {
      const studentAnswer =
        String(studentAnswers[key.question_number] || "").trim().toUpperCase()

      const correctAnswer = String(key.answer || "").trim().toUpperCase()

      let status = ""

      if (!studentAnswer) {
        empty++
        status = "empty"
      } else if (studentAnswer === correctAnswer) {
        correct++
        status = "correct"
      } else {
        wrong++
        status = "wrong"
      }

      details.push({
        number: key.question_number,
        studentAnswer,
        correctAnswer,
        status,
      })
    })

    const total = answerKeys.length

    const score =
      total > 0
        ? Math.round((correct / total) * 100)
        : 0

    return {
      correct,
      wrong,
      empty,
      total,
      score,
      details,
    }
  }

  // =========================
  // KAMERA
  // =========================

  const startCamera = async () => {
    try {
      setMessage("")

      if (!selectedExam) {
        setMessage("Silakan pilih ujian terlebih dahulu.")
        return
      }

      if (!studentName.trim()) {
        setMessage("Silakan masukkan nama siswa terlebih dahulu.")
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment",
          },
          width: {
            ideal: 1920,
          },
          height: {
            ideal: 1080,
          },
        },
        audio: false,
      })

      streamRef.current = stream

      setCameraOpen(true)
    } catch (error) {
      console.error("Kamera error:", error)

      setMessage(
        "Kamera tidak dapat digunakan. Pastikan izin kamera sudah diberikan."
      )
    }
  }

  const stopCameraTracks = () => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop())

      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const stopCamera = () => {
    stopCameraTracks()

    setCameraOpen(false)
    setScanning(false)

    setPreview(null)
    setStudentAnswers({})
    setCorrectionResult(null)
    setMessage("")
  }

  // =========================
  // URUTKAN MARKER
  // =========================

  const orderMarkers = (markers) => {
    const sorted = [...markers].sort(
      (a, b) => (a.x + a.y) - (b.x + b.y)
    )

    const topLeft = sorted[0]
    const bottomRight = sorted[3]

    const remaining = sorted.slice(1, 3)

    let topRight = remaining[0]
    let bottomLeft = remaining[1]

    if (topRight.y > bottomLeft.y) {
      const temp = topRight
      topRight = bottomLeft
      bottomLeft = temp
    }

    return {
      topLeft,
      topRight,
      bottomLeft,
      bottomRight,
    }
  }

  // =========================
  // DETEKSI 4 MARKER
  // =========================

  // =========================
// DETEKSI 4 MARKER LJK
// =========================

const detectAnswerSheet = (canvas) => {
  if (!window.cv || !window.cv.Mat) {
    return { detected: false, message: "OpenCV belum siap." }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blurred = null
  let edges = null
  let dilated = null
  let contours = null
  let hierarchy = null
  let kernel = null
  let bestContour = null

  try {
    src = cv.imread(canvas)
    const imageWidth = src.cols
    const imageHeight = src.rows
    const imageArea = imageWidth * imageHeight

    // 1. GRAYSCALE
    gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // 2. BLUR (supaya teks/bubble di dalam kertas
    //    tidak memecah tepi kertas jadi banyak potongan)
    blurred = new cv.Mat()
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)

    // 3. DETEKSI TEPI
    edges = new cv.Mat()
    cv.Canny(blurred, edges, 50, 150)

    // 4. SAMBUNGKAN TEPI YANG TERPUTUS
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7))
    dilated = new cv.Mat()
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2)

    // 5. CARI CONTOUR
    contours = new cv.MatVector()
    hierarchy = new cv.Mat()
    cv.findContours(
      dilated, contours, hierarchy,
      cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE
    )

    // 6. PILIH KONTUR TERBESAR YANG MASUK AKAL
    //    SEBAGAI KERTAS LJK
    let bestArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)

      // Kertas minimal 20% dari luas foto,
      // tapi tidak mungkin memenuhi 100% foto
      if (area > bestArea && area > imageArea * 0.2 && area < imageArea * 0.95) {
        if (bestContour) bestContour.delete()
        bestContour = contour
        bestArea = area
      } else {
        contour.delete()
      }
    }

    if (!bestContour) {
      return {
        detected: false,
        message:
          "Lembar jawaban tidak terdeteksi. Pastikan seluruh LJK terlihat jelas dan kontras dengan latar belakang meja.",
      }
    }

    // 7. BUNGKUS DENGAN ROTATED RECTANGLE
    //    (tahan terhadap kertas miring / sedikit terlipat)
    const rotatedRect = cv.minAreaRect(bestContour)
    bestContour.delete()
    bestContour = null

    const boxPoints = cv.RotatedRect.points(rotatedRect)
    const pts = [boxPoints[0], boxPoints[1], boxPoints[2], boxPoints[3]]

    // =========================================
    // 8. URUTKAN 4 TITIK
    //    topLeft, topRight, bottomLeft, bottomRight
    //    (toleran terhadap rotasi sedang)
    // =========================================

    const byY = [...pts].sort((a, b) => a.y - b.y)
    const topTwo = [byY[0], byY[1]].sort((a, b) => a.x - b.x)
    const bottomTwo = [byY[2], byY[3]].sort((a, b) => a.x - b.x)

    const topLeft = topTwo[0]
    const topRight = topTwo[1]
    const bottomLeft = bottomTwo[0]
    const bottomRight = bottomTwo[1]

    // 9. VALIDASI BENTUK
    if (
      topLeft.x >= topRight.x ||
      bottomLeft.x >= bottomRight.x ||
      topLeft.y >= bottomLeft.y ||
      topRight.y >= bottomRight.y
    ) {
      return {
        detected: false,
        message:
          "Bentuk lembar jawaban belum terdeteksi dengan benar. Coba foto lebih lurus/rata dan pastikan latar belakang kontras.",
      }
    }

    const markers = {
      topLeft: { x: topLeft.x, y: topLeft.y },
      topRight: { x: topRight.x, y: topRight.y },
      bottomLeft: { x: bottomLeft.x, y: bottomLeft.y },
      bottomRight: { x: bottomRight.x, y: bottomRight.y },
    }

    console.log("================================")
    console.log("SUDUT LJK TERDETEKSI (deteksi tepi kertas)")
    console.log("TOP LEFT:", markers.topLeft)
    console.log("TOP RIGHT:", markers.topRight)
    console.log("BOTTOM LEFT:", markers.bottomLeft)
    console.log("BOTTOM RIGHT:", markers.bottomRight)
    console.log("================================")

    return {
      detected: true,
      message: "Lembar jawaban berhasil terdeteksi! ✅",
      markers,
    }
  } catch (error) {
    console.error("ERROR DETEKSI LJK:", error)
    return { detected: false, message: "Gagal mendeteksi lembar jawaban." }
  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blurred) blurred.delete()
    if (edges) edges.delete()
    if (dilated) dilated.delete()
    if (contours) contours.delete()
    if (hierarchy) hierarchy.delete()
    if (kernel) kernel.delete()
    if (bestContour) bestContour.delete()
  }
}
  // =========================
  // LURUSKAN FOTO LJK
  // =========================

const warpAnswerSheet = (canvas, markers) => {
  const cv = window.cv
  let src = null, dst = null, srcTri = null, dstTri = null, matrix = null

  try {
    src = cv.imread(canvas)
    const width = 900
    const height = 1200

    // Pakai langsung hasil dari detectAnswerSheet, jangan dihitung ulang
    const srcPoints = [
      markers.topLeft.x, markers.topLeft.y,
      markers.topRight.x, markers.topRight.y,
      markers.bottomRight.x, markers.bottomRight.y,
      markers.bottomLeft.x, markers.bottomLeft.y,
    ]

    const dstPoints = [
      0, 0,
      width - 1, 0,
      width - 1, height - 1,
      0, height - 1,
    ]

    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, srcPoints)
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstPoints)
    matrix = cv.getPerspectiveTransform(srcTri, dstTri)

    dst = new cv.Mat()
    cv.warpPerspective(
      src, dst, matrix,
      new cv.Size(width, height),
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    )

    const resultCanvas = document.createElement("canvas")
    resultCanvas.width = width
    resultCanvas.height = height
    cv.imshow(resultCanvas, dst)

    return resultCanvas
  } catch (error) {
    console.error("ERROR WARP:", error)
    return null
  } finally {
    if (src) src.delete()
    if (dst) dst.delete()
    if (srcTri) srcTri.delete()
    if (dstTri) dstTri.delete()
    if (matrix) matrix.delete()
  }
}

// =========================
// BACA JAWABAN SISWA
// FINAL: 45-100 SOAL, PILIHAN A-E
// Mencari bubble secara otomatis lalu
// memilih tinta paling tebal.
// =========================
const readStudentAnswers = (canvas, totalQuestions) => {
  const emptyResult = (debug) => ({ answers: {}, debug })

  if (!window.cv || !window.cv.Mat) {
    return emptyResult("❌ OpenCV belum siap.")
  }

  if (!Number.isInteger(totalQuestions) || totalQuestions < 45 || totalQuestions > 100) {
    return emptyResult("❌ Jumlah soal harus antara 45 sampai 100 soal pilihan A-E.")
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blurred = null
  let circles = null

  try {
    src = cv.imread(canvas)

    gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    blurred = new cv.Mat()
    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(3, 3),
      0
    )

    // -------------------------------------------------
    // LAYOUT HARUS SAMA DENGAN AnswerSheet.jsx
    // 45-70 = 2 kolom
    // 80-100 = 3 kolom
    // -------------------------------------------------
    const columnCount = totalQuestions >= 80 ? 3 : 2

    // AnswerSheet menggunakan ceil lalu slice.
    const questionsPerColumn = Math.ceil(
      totalQuestions / columnCount
    )

    const rowsPerColumn = Array.from(
      { length: columnCount },
      (_, index) => {
        const start = index * questionsPerColumn
        return Math.max(
          0,
          Math.min(
            questionsPerColumn,
            totalQuestions - start
          )
        )
      }
    )

    // -------------------------------------------------
    // HOUGH CIRCLES
    // Dicoba beberapa parameter supaya tetap toleran
    // terhadap kamera HP, cahaya, dan ketebalan cetakan.
    // Bubble 4-5mm pada hasil warp 900x1200 biasanya
    // berada sekitar radius 6-11px.
    // -------------------------------------------------
    const houghAttempts = [
      { dp: 1, minDist: 8, p1: 100, p2: 12, minR: 5, maxR: 14 },
      { dp: 1, minDist: 8, p1: 80, p2: 10, minR: 5, maxR: 15 },
      { dp: 1, minDist: 7, p1: 70, p2: 9, minR: 5, maxR: 16 },
    ]

    const rawCircles = []

    for (const params of houghAttempts) {
      const detected = new cv.Mat()

      try {
        cv.HoughCircles(
          blurred,
          detected,
          cv.HOUGH_GRADIENT,
          params.dp,
          params.minDist,
          params.p1,
          params.p2,
          params.minR,
          params.maxR
        )

        if (detected.cols > 0 && detected.data32F) {
          for (let i = 0; i < detected.cols; i++) {
            const x = detected.data32F[i * 3]
            const y = detected.data32F[i * 3 + 1]
            const radius = detected.data32F[i * 3 + 2]

            if (
              Number.isFinite(x) &&
              Number.isFinite(y) &&
              Number.isFinite(radius) &&
              radius >= 5 &&
              radius <= 16 &&
              x > 15 &&
              x < gray.cols - 15 &&
              y > 15 &&
              y < gray.rows - 15
            ) {
              rawCircles.push({ x, y, radius })
            }
          }
        }
      } finally {
        detected.delete()
      }
    }

    // -------------------------------------------------
    // DEDUPLIKASI CIRCLE DARI BEBERAPA ATTEMPT
    // -------------------------------------------------
    rawCircles.sort((a, b) => a.radius - b.radius)

    const uniqueBubbles = []

    rawCircles.forEach((bubble) => {
      const duplicate = uniqueBubbles.some((existing) => {
        const dx = existing.x - bubble.x
        const dy = existing.y - bubble.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        return distance < Math.max(5, Math.min(9, bubble.radius * 0.9))
      })

      if (!duplicate) {
        uniqueBubbles.push(bubble)
      }
    })

    if (uniqueBubbles.length < totalQuestions * 2) {
      return emptyResult(
        `❌ Bubble yang terdeteksi terlalu sedikit (${uniqueBubbles.length}). Pastikan seluruh LJK terlihat, fokus kamera tajam, dan cahaya cukup.`
      )
    }

    // -------------------------------------------------
    // KELOMPOKKAN X MENJADI TRACK A-E
    // Track asli akan memiliki banyak bubble karena
    // satu track dipakai oleh banyak nomor soal.
    // -------------------------------------------------
    const xSorted = [...uniqueBubbles].sort((a, b) => a.x - b.x)
    const xGroups = []

    xSorted.forEach((bubble) => {
      // Toleransi berdasarkan radius, bukan angka besar tetap.
      let group = null

      for (const candidate of xGroups) {
        const tolerance = Math.max(
          7,
          Math.min(13, ((candidate.medianRadius || 8) * 1.35))
        )

        if (Math.abs(candidate.centerX - bubble.x) <= tolerance) {
          group = candidate
          break
        }
      }

      if (!group) {
        group = {
          centerX: bubble.x,
          bubbles: [],
          medianRadius: bubble.radius,
        }
        xGroups.push(group)
      }

      group.bubbles.push(bubble)
      group.centerX =
        group.bubbles.reduce((sum, item) => sum + item.x, 0) /
        group.bubbles.length

      const radii = group.bubbles
        .map((item) => item.radius)
        .sort((a, b) => a - b)

      group.medianRadius =
        radii[Math.floor(radii.length / 2)] || bubble.radius
    })

    xGroups.sort((a, b) => a.centerX - b.centerX)

    // Track yang benar biasanya berisi minimal beberapa bubble.
    // Jangan terlalu ketat karena kamera bisa kehilangan bubble kosong.
    const minTrackBubbles = Math.max(
      5,
      Math.floor(Math.min(...rowsPerColumn.filter(Boolean)) * 0.12)
    )

    let validTracks = xGroups.filter(
      (group) => group.bubbles.length >= minTrackBubbles
    )

    // Kalau filter terlalu ketat, turunkan ke 3.
    if (validTracks.length < columnCount * 5) {
      validTracks = xGroups.filter(
        (group) => group.bubbles.length >= 3
      )
    }

    if (validTracks.length < columnCount * 5) {
      return emptyResult(
        `❌ Track A-E belum lengkap. Bubble ${uniqueBubbles.length}, track ${validTracks.length}/${columnCount * 5}. Foto LJK lebih dekat dan pastikan semua baris terlihat.`
      )
    }

    // -------------------------------------------------
    // PILIH columnCount x 5 TRACK TERBAIK.
    // Bukan hardcode koordinat: posisi tetap diambil
    // dari bubble yang benar-benar terdeteksi pada foto.
    // -------------------------------------------------
    const wantedTrackCount = columnCount * 5

    let selectedTracks = [...validTracks]

    if (selectedTracks.length > wantedTrackCount) {
      selectedTracks = selectedTracks
        .sort((a, b) => b.bubbles.length - a.bubbles.length)
        .slice(0, wantedTrackCount)
        .sort((a, b) => a.centerX - b.centerX)
    }

    // Karena tiap kolom selalu berisi 5 pilihan,
    // urutan X dibagi per 5 track.
    const finalColumns = []

    for (let i = 0; i < columnCount; i++) {
      const column = selectedTracks
        .slice(i * 5, i * 5 + 5)
        .sort((a, b) => a.centerX - b.centerX)

      if (column.length !== 5) {
        return emptyResult(
          `❌ Kolom ${i + 1} hanya memiliki ${column.length} track A-E.`
        )
      }

      finalColumns.push(column)
    }

    // -------------------------------------------------
    // HITUNG MEDIAN JARAK ANTAR BARIS.
    // Ini penting untuk 100 soal supaya baris 1 tidak
    // bergabung dengan baris 2.
    // -------------------------------------------------
    const estimateRowSpacing = (column) => {
      const ys = column
        .flatMap((group) => group.bubbles.map((b) => b.y))
        .sort((a, b) => a - b)

      const diffs = []

      for (let i = 1; i < ys.length; i++) {
        const diff = ys[i] - ys[i - 1]

        // Jarak dalam satu baris kecil; jarak antar
        // baris jauh lebih besar. Ambil kandidat yang masuk akal.
        if (diff >= 4 && diff <= 30) {
          diffs.push(diff)
        }
      }

      if (diffs.length === 0) return 14

      diffs.sort((a, b) => a - b)
      const medianDiff = diffs[Math.floor(diffs.length / 2)]

      // Kalau median terkena jarak dalam row, ambil percentile
      // yang lebih besar sebagai pendekatan spacing antar row.
      const p75 = diffs[Math.floor(diffs.length * 0.75)] || medianDiff

      return Math.max(8, Math.min(25, p75))
    }

    // -------------------------------------------------
    // HITUNG TINTA
    // Sampel hanya bagian DALAM bubble agar garis lingkaran
    // cetakan tidak dianggap sebagai tinta siswa.
    // -------------------------------------------------
    const calculateInk = (centerX, centerY, radius) => {
      const sampleRadius = Math.max(
        3,
        Math.min(8, radius * 0.58)
      )

      const cx = Math.round(centerX)
      const cy = Math.round(centerY)
      const r2 = sampleRadius * sampleRadius

      let dark = 0
      let total = 0

      const yStart = Math.max(0, Math.floor(cy - sampleRadius))
      const yEnd = Math.min(gray.rows - 1, Math.ceil(cy + sampleRadius))
      const xStart = Math.max(0, Math.floor(cx - sampleRadius))
      const xEnd = Math.min(gray.cols - 1, Math.ceil(cx + sampleRadius))

      for (let y = yStart; y <= yEnd; y++) {
        for (let x = xStart; x <= xEnd; x++) {
          const dx = x - centerX
          const dy = y - centerY

          if (dx * dx + dy * dy > r2) continue

          const value = gray.ucharPtr(y, x)[0]

          // 145 cukup sensitif untuk pensil/pulpen hitam,
          // tetapi garis bubble di tepi sudah berada di luar ROI.
          if (value < 145) dark++
          total++
        }
      }

      return total > 0 ? dark / total : 0
    }

    // -------------------------------------------------
    // CARI BUBBLE TERDEKAT DARI TRACK + BARIS
    // -------------------------------------------------
    const findBubble = (group, rowY, rowSpacing) => {
      const toleranceX = Math.max(
        7,
        Math.min(14, group.medianRadius * 1.4)
      )

      const toleranceY = Math.max(
        4,
        Math.min(8, rowSpacing * 0.32)
      )

      let best = null
      let bestDistance = Infinity

      group.bubbles.forEach((bubble) => {
        const dx = Math.abs(bubble.x - group.centerX)
        const dy = Math.abs(bubble.y - rowY)

        if (dx <= toleranceX && dy <= toleranceY) {
          const distance = dx + dy * 1.5

          if (distance < bestDistance) {
            best = bubble
            bestDistance = distance
          }
        }
      })

      return best
    }

    const choices = ["A", "B", "C", "D", "E"]
    const answers = {}

    let totalRowsDetected = 0
    let answeredCount = 0
    let ambiguousCount = 0

    // -------------------------------------------------
    // PROSES TIAP KOLOM
    // -------------------------------------------------
    finalColumns.forEach((column, columnIndex) => {
      const rowSpacing = estimateRowSpacing(column)
      const rowTolerance = Math.max(
        4,
        Math.min(8, rowSpacing * 0.32)
      )

      const allBubbles = column.flatMap((group) => group.bubbles)
        .sort((a, b) => a.y - b.y)

      // Kelompokkan Y secara adaptif.
      const rows = []

      allBubbles.forEach((bubble) => {
        let row = rows.find(
          (candidate) =>
            Math.abs(candidate.centerY - bubble.y) <= rowTolerance
        )

        if (!row) {
          row = {
            centerY: bubble.y,
            bubbles: [],
          }
          rows.push(row)
        }

        row.bubbles.push(bubble)
        row.centerY =
          row.bubbles.reduce((sum, item) => sum + item.y, 0) /
          row.bubbles.length
      })

      rows.sort((a, b) => a.centerY - b.centerY)

      // Buang row yang jelas bukan row jawaban.
      // Minimal 2 bubble dari 5 track boleh terlihat karena
      // sebagian bubble bisa gagal dideteksi oleh kamera.
      const validRows = rows.filter((row) => {
        const matched = column.filter((group) =>
          row.bubbles.some(
            (bubble) =>
              Math.abs(bubble.x - group.centerX) <=
              Math.max(7, Math.min(14, group.medianRadius * 1.5))
          )
        ).length

        return matched >= 2
      })

      const expectedRows = rowsPerColumn[columnIndex]
      const usableRows = validRows.slice(0, expectedRows)

      totalRowsDetected += usableRows.length

      // Kalau row yang terdeteksi jauh lebih sedikit, jangan
      // memalsukan jawaban. Soal yang tidak terbaca tetap kosong.
      usableRows.forEach((row) => {
        const inkValues = column.map((group) => {
          const bubble = findBubble(
            group,
            row.centerY,
            rowSpacing
          )

          // Kalau circle aktual tidak ditemukan di row ini,
          // gunakan pusat row + pusat track untuk mengukur tinta.
          // Ini tetap mengikuti posisi bubble yang terdeteksi dari
          // track, bukan koordinat jawaban hardcode.
          if (bubble) {
            return calculateInk(
              bubble.x,
              bubble.y,
              bubble.radius
            )
          }

          return calculateInk(
            group.centerX,
            row.centerY,
            group.medianRadius
          )
        })

        let highestIndex = 0

        for (let i = 1; i < inkValues.length; i++) {
          if (inkValues[i] > inkValues[highestIndex]) {
            highestIndex = i
          }
        }

        const sortedInk = [...inkValues].sort((a, b) => b - a)
        const highest = sortedInk[0] || 0
        const second = sortedInk[1] || 0

        // Threshold dibuat relatif: bubble kosong hanya punya sedikit
        // tinta di tengah; bubble yang diarsir tebal jauh lebih tinggi.
        const minimumInk = 0.10
        const ambiguityRatio = 0.78

        const questionNumber =
          columnIndex * questionsPerColumn +
          usableRows.indexOf(row) +
          1

        if (questionNumber > totalQuestions) return

        if (highest < minimumInk) {
          answers[questionNumber] = ""
        } else if (
          second >= highest * ambiguityRatio &&
          highest >= 0.18
        ) {
          // Dua pilihan sama-sama hitam -> jangan menebak.
          answers[questionNumber] = ""
          ambiguousCount++
        } else {
          answers[questionNumber] = choices[highestIndex]
          answeredCount++
        }

        console.log(
          `SOAL ${questionNumber}:`,
          inkValues.map((value) => Number(value.toFixed(3))),
          "=>",
          answers[questionNumber] || "KOSONG"
        )
      })

      // Soal yang row-nya tidak ditemukan tetap dibuat sebagai kosong.
      for (let localRow = usableRows.length; localRow < expectedRows; localRow++) {
        const questionNumber =
          columnIndex * questionsPerColumn + localRow + 1

        if (questionNumber <= totalQuestions && answers[questionNumber] === undefined) {
          answers[questionNumber] = ""
        }
      }
    })

    // Pastikan SEMUA nomor 1..totalQuestions ada.
    // Ini penting supaya kosong benar-benar dihitung sebagai kosong.
    for (let number = 1; number <= totalQuestions; number++) {
      if (answers[number] === undefined) {
        answers[number] = ""
      }
    }

    const debug =
      `🔍 Bubble: ${uniqueBubbles.length}` +
      ` | Track: ${selectedTracks.length}/${wantedTrackCount}` +
      ` | Kolom: ${finalColumns.map((c) => c.length).join("/")}` +
      ` | Baris: ${totalRowsDetected}/${totalQuestions}` +
      ` | Terbaca: ${answeredCount}` +
      ` | Double: ${ambiguousCount}`

    console.log("================================")
    console.log("TOTAL SOAL:", totalQuestions)
    console.log("ROWS PER COLUMN:", rowsPerColumn)
    console.log(
      "TRACK X:",
      finalColumns.map((column) =>
        column.map((group) => Math.round(group.centerX))
      )
    )
    console.log("HASIL JAWABAN:", answers)
    console.log("DEBUG:", debug)
    console.log("================================")

    return {
      answers,
      debug,
    }
  } catch (error) {
    console.error("ERROR MEMBACA JAWABAN:", error)

    return emptyResult(
      `❌ Gagal membaca jawaban: ${error?.message || "error tidak diketahui"}`
    )
  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blurred) blurred.delete()
    if (circles) circles.delete()
  }
}

// const handlePreviewClick = (e) => {
//   const img = e.target
//   const rect = img.getBoundingClientRect()
//   const naturalWidth = img.naturalWidth
//   const naturalHeight = img.naturalHeight

//   const containerRatio = rect.width / rect.height
//   const imageRatio = naturalWidth / naturalHeight

//   let renderedWidth, renderedHeight, offsetX, offsetY

//   if (imageRatio > containerRatio) {
//     renderedWidth = rect.width
//     renderedHeight = rect.width / imageRatio
//     offsetX = 0
//     offsetY = (rect.height - renderedHeight) / 2
//   } else {
//     renderedHeight = rect.height
//     renderedWidth = rect.height * imageRatio
//     offsetY = 0
//     offsetX = (rect.width - renderedWidth) / 2
//   }

//   const clickX = e.clientX - rect.left - offsetX
//   const clickY = e.clientY - rect.top - offsetY

//   if (clickX < 0 || clickY < 0 || clickX > renderedWidth || clickY > renderedHeight) {
//     return
//   }

//   const naturalX = Math.round((clickX / renderedWidth) * naturalWidth)
//   const naturalY = Math.round((clickY / renderedHeight) * naturalHeight)

//   setCalibratePoint({ x: naturalX, y: naturalY })
// }

  const handleScan = async () => {
    if (!videoRef.current) return

    setScanning(true)
    setMessage("")
    setPreview(null)
    setCorrectionResult(null)

    try {
      // Ambil kunci jawaban terlebih dahulu
      const answerKeys = await getAnswerKey()

      if (answerKeys.length === 0) {
        setMessage(
          "Kunci jawaban untuk ujian ini belum tersedia."
        )

        setScanning(false)
        return
      }

      const video = videoRef.current

      if (
        !video.videoWidth ||
        !video.videoHeight
      ) {
        setMessage(
          "Kamera belum siap. Tunggu beberapa detik lalu coba lagi."
        )

        setScanning(false)
        return
      }

      // Ambil foto dari kamera
      const canvas =
        document.createElement("canvas")

      canvas.width =
        video.videoWidth

      canvas.height =
        video.videoHeight

      const context =
        canvas.getContext("2d")

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      )

      setMessage(
        "Mendeteksi marker LJK..."
      )

      // Deteksi marker
      const detection =
        detectAnswerSheet(canvas)

      console.log(
        "Hasil deteksi:",
        detection
      )

      if (detection.detected) {
        setMessage(
        `Marker terdeteksi:
          TL(${Math.round(detection.markers.topLeft.x)}, ${Math.round(detection.markers.topLeft.y)})
          TR(${Math.round(detection.markers.topRight.x)}, ${Math.round(detection.markers.topRight.y)})
          BL(${Math.round(detection.markers.bottomLeft.x)}, ${Math.round(detection.markers.bottomLeft.y)})
          BR(${Math.round(detection.markers.bottomRight.x)}, ${Math.round(detection.markers.bottomRight.y)})`
        )
      }

      if (!detection.detected) {
        setMessage(detection.message)

        const imageUrl =
          canvas.toDataURL(
            "image/jpeg",
            0.9
          )

        setPreview(imageUrl)

        setScanning(false)
        return
      }

      setMessage(
        "Meluruskan lembar jawaban..."
      )

      // Luruskan LJK
      const correctedCanvas =
        warpAnswerSheet(
          canvas,
          detection.markers
        )

      if (!correctedCanvas) {
        setMessage(
          "Gagal meluruskan LJK."
        )

        setScanning(false)
        return
      }

      console.log(
        "UKURAN HASIL WARP:",
        correctedCanvas.width,
        correctedCanvas.height
      )

      const imageUrl =
        correctedCanvas.toDataURL(
          "image/jpeg",
          0.95
        )

      setPreview(imageUrl)

      setMessage(
        "Membaca jawaban siswa..."
      )

      // Baca jawaban sesuai jumlah soal
      const scanResult =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      console.log(
        "HASIL PEMBACAAN:",
        scanResult
      )

      const detectedAnswers =
        scanResult?.answers || {}

      setStudentAnswers(
        detectedAnswers
      )

      // Tampilkan debug di HP
      setMessage(
        scanResult.debug
      )

      // Hitung hasil
      const resultCorrection =
        calculateResult(
          detectedAnswers,
          answerKeys
        )

      setCorrectionResult(
        resultCorrection
      )

      setMessage(
        `${scanResult?.debug || "Pembacaan selesai."} | Koreksi selesai! 🎉`
      )
    } catch (error) {
      console.error(
        "SCAN ERROR DETAIL:",
        error
      )

      console.error(
        "ERROR MESSAGE:",
        error?.message
      )

      setMessage(
        `Terjadi kesalahan: ${
          error?.message || "tidak diketahui"
        }`
      )
    }

    setScanning(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">

      <div className="mx-auto max-w-5xl">

        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 md:text-3xl">
            Koreksi Lembar Jawaban
          </h1>

          <p className="mt-2 text-gray-500">
            Pilih ujian kemudian scan lembar jawaban siswa.
          </p>
        </div>

        {/* PILIH UJIAN */}
        <div className="rounded-2xl bg-white p-5 shadow-sm md:p-6">

          <label className="mb-2 block font-semibold text-slate-700">
            Pilih Ujian
          </label>

          <select
            value={selectedExam}
            onChange={(e) => {
              setSelectedExam(e.target.value)
              setCorrectionResult(null)
              setStudentAnswers({})
              setMessage("")
            }}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-slate-500"
          >
            <option value="">
              -- Pilih ujian --
            </option>

            {exams.map((exam) => (
              <option
                key={exam.id}
                value={exam.id}
              >
                {exam.title || exam.name || "Ujian"}
              </option>
            ))}
          </select>

          <div className="mt-5">
            <label className="mb-2 block font-semibold text-slate-700">
              Nama Siswa
            </label>

            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Masukkan nama siswa"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-slate-500"
            />
          </div>

        </div>

        {/* SCANNER */}
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm md:p-6">

          <h2 className="text-xl font-bold text-slate-800">
            Scan Lembar Jawaban
          </h2>

          <p className="mt-1 text-gray-500">
            Pastikan seluruh LJK dan 4 marker hitam terlihat.
          </p>

          <div className="relative mt-5 overflow-hidden rounded-2xl bg-black">

            {cameraOpen ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="block min-h-[400px] w-full object-cover"
                />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">

                  <div className="relative h-[85%] w-[80%] rounded-xl border-2 border-white">

                    <div className="absolute -left-1 -top-1 h-8 w-8 border-l-4 border-t-4 border-green-400" />

                    <div className="absolute -right-1 -top-1 h-8 w-8 border-r-4 border-t-4 border-green-400" />

                    <div className="absolute -bottom-1 -left-1 h-8 w-8 border-b-4 border-l-4 border-green-400" />

                    <div className="absolute -bottom-1 -right-1 h-8 w-8 border-b-4 border-r-4 border-green-400" />

                  </div>

                </div>

                <div className="absolute left-0 right-0 top-4 text-center">

                  <span className="rounded-full bg-black/60 px-4 py-2 text-sm text-white">
                    Pastikan 4 marker hitam terlihat
                  </span>

                </div>

              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">

                <div className="text-6xl">
                  📷
                </div>

                <h3 className="mt-4 text-xl font-bold text-white">
                  Scanner Lembar Jawaban
                </h3>

                <p className="mt-2 max-w-md text-gray-300">
                  Kamera akan digunakan untuk memindai
                  lembar jawaban siswa.
                </p>

                <button
                  onClick={startCamera}
                  disabled={!selectedExam || !studentName.trim()}
                  className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📷 Buka Scanner
                </button>

              </div>
            )}

          </div>

          {cameraOpen && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">

              <button
                onClick={stopCamera}
                className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>

              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex-1 rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {scanning
                  ? "⏳ Memindai..."
                  : "🔍 Scan Lembar Jawaban"}
              </button>

            </div>
          )}

          {message && (
            <div className="mt-5 rounded-xl bg-gray-100 p-4 text-center text-sm text-gray-700">
              {message}
            </div>
          )}

          {/* HASIL KOREKSI */}

          {correctionResult && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">

              <h2 className="text-2xl font-bold text-slate-800">
                🎉 Hasil Koreksi
              </h2>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">

                <p className="mt-2 text-gray-500">
                  Nama Siswa:{" "}
                  <span className="font-semibold text-slate-800">
                    {studentName}
                  </span>
                </p>

                <div className="rounded-xl bg-blue-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Nilai
                  </p>

                  <p className="mt-2 text-4xl font-bold text-blue-600">
                    {correctionResult.score}
                  </p>
                </div>

                <div className="rounded-xl bg-green-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Benar
                  </p>

                  <p className="mt-2 text-4xl font-bold text-green-600">
                    {correctionResult.correct}
                  </p>
                </div>

                <div className="rounded-xl bg-red-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Salah
                  </p>

                  <p className="mt-2 text-4xl font-bold text-red-600">
                    {correctionResult.wrong}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-100 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Kosong
                  </p>

                  <p className="mt-2 text-4xl font-bold text-gray-700">
                    {correctionResult.empty}
                  </p>
                </div>

              </div>

              <div className="mt-6 overflow-x-auto">

                <table className="w-full border-collapse">

                  <thead>
                    <tr className="border-b bg-gray-50 text-left">
                      <th className="p-3">No</th>
                      <th className="p-3">Jawaban Siswa</th>
                      <th className="p-3">Kunci Jawaban</th>
                      <th className="p-3">Hasil</th>
                    </tr>
                  </thead>

                  <tbody>
                    {correctionResult.details.map((item) => (
                      <tr
                        key={item.number}
                        className="border-b"
                      >
                        <td className="p-3">
                          {item.number}
                        </td>

                        <td className="p-3">
                          {item.studentAnswer || "-"}
                        </td>

                        <td className="p-3">
                          {item.correctAnswer}
                        </td>

                        <td className="p-3">
                          {item.status === "correct" && "✅ Benar"}
                          {item.status === "wrong" && "❌ Salah"}
                          {item.status === "empty" && "⬜ Kosong"}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                </table>

              </div>

            </div>
          )}

          {/* PREVIEW */}

          {preview && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">

              <h3 className="mb-3 font-bold text-slate-800">
                Hasil Scan yang Sudah Diluruskan
              </h3>

              <div className="overflow-hidden rounded-xl bg-gray-100">
                <img
                  src={preview}
                  alt="Hasil scan"
                  onClick={(e) => {
                    const img = e.currentTarget
                    const rect = img.getBoundingClientRect()

                    const x =
                      Math.round(
                        ((e.clientX - rect.left) / rect.width) *
                          img.naturalWidth
                      )

                    const y =
                      Math.round(
                        ((e.clientY - rect.top) / rect.height) *
                          img.naturalHeight
                      )

                    setCalibratePoint({
                      x,
                      y
                    })
                  }}
                  className="block w-full cursor-crosshair object-contain"
                />
              </div>

              {calibratePoint && (
                <div className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-center text-sm font-mono text-white">
                  Koordinat diklik: X = {calibratePoint.x}, Y = {calibratePoint.y}
                </div>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  )
}

export default correction