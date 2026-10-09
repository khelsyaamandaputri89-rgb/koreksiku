import { useEffect, useRef, useState } from "react"
import { supabase } from "../services/supabase"
import {
  PAPER_W,
  PAPER_H,
  MARKER_CENTER,
  getLJKLayout,
  getBubbleCenter,
} from "../utils/ljkLayout"

// Resolusi hasil warp: 5 px per mm -> 1050 x 1650
const PX = 5
const OUT_W = PAPER_W * PX
const OUT_H = PAPER_H * PX

// Bubble dianggap terisi jika lebih gelap dari bubble kosong
// di baris yang sama sebesar nilai ini (0 - 1).
// Naikkan jika bubble kosong terbaca terisi, turunkan jika
// arsiran pensil tipis tidak terbaca.
const FILL_MIN = 0.15

const CHOICES = ["A", "B", "C", "D", "E"]

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function Correction() {
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

  useEffect(() => {
    fetchExams()
    return () => stopCameraTracks()
  }, [])

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOpen])

  // =====================================================
  // DATA UJIAN & KUNCI JAWABAN
  // =====================================================

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

    const uniqueMap = new Map()
    ;(data || []).forEach((row) => {
      uniqueMap.set(Number(row.question_number), row)
    })

    return Array.from(uniqueMap.values()).sort(
      (a, b) => Number(a.question_number) - Number(b.question_number)
    )
  }

  // =====================================================
  // HITUNG HASIL
  // Ganda dihitung salah.
  // =====================================================

  const calculateResult = (answers, answerKeys) => {
    let correct = 0
    let wrong = 0
    let empty = 0
    let double = 0

    const details = []

    answerKeys.forEach((key) => {
      const studentAnswer = String(answers[key.question_number] || "")
        .trim()
        .toUpperCase()

      const correctAnswer = String(key.answer || "").trim().toUpperCase()

      let status = ""

      if (!studentAnswer) {
        empty++
        status = "empty"
      } else if (studentAnswer === "GANDA") {
        wrong++
        double++
        status = "double"
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
    const score = total > 0 ? Math.round((correct / total) * 100) : 0

    return { correct, wrong, empty, double, total, score, details }
  }

  // =====================================================
  // KAMERA
  // =====================================================

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
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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
      streamRef.current.getTracks().forEach((track) => track.stop())
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

  // =====================================================
  // URUTKAN 4 TITIK: TL, TR, BR, BL
  // Metode jumlah/selisih -> tahan terhadap kertas miring.
  // =====================================================

  const orderCorners = (pts) => {
    if (!pts || pts.length !== 4) return null

    const tl = pts.reduce((a, b) => (a.x + a.y <= b.x + b.y ? a : b))
    const br = pts.reduce((a, b) => (a.x + a.y >= b.x + b.y ? a : b))
    const tr = pts.reduce((a, b) => (a.y - a.x <= b.y - b.x ? a : b))
    const bl = pts.reduce((a, b) => (a.y - a.x >= b.y - b.x ? a : b))

    if (new Set([tl, tr, br, bl]).size !== 4) return null

    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl }
  }

  const quadArea = (o) => {
    const p = [o.topLeft, o.topRight, o.bottomRight, o.bottomLeft]
    let s = 0
    for (let i = 0; i < 4; i++) {
      const a = p[i]
      const b = p[(i + 1) % 4]
      s += a.x * b.y - b.x * a.y
    }
    return Math.abs(s) / 2
  }

  // =====================================================
  // DETEKSI 4 MARKER HITAM (kotak 8mm di pojok LJK)
  //
  // LJK boleh miring / dipotret dari sudut, asalkan
  // keempat marker terlihat.
  // =====================================================

  const detectMarkers = (canvas) => {
    const cv = window.cv

    if (!cv || !cv.Mat) {
      return { detected: false, message: "OpenCV belum siap.", candidates: [] }
    }

    let src = null
    let gray = null
    let blur = null
    let bin = null
    let contours = null
    let hierarchy = null

    const candidates = []

    try {
      src = cv.imread(canvas)

      gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      blur = new cv.Mat()
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)

      const maxDim = Math.max(src.cols, src.rows)

      let block = Math.round(maxDim * 0.03)
      if (block % 2 === 0) block += 1
      block = Math.max(31, block)

      bin = new cv.Mat()
      cv.adaptiveThreshold(
        blur,
        bin,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        block,
        18
      )

      contours = new cv.MatVector()
      hierarchy = new cv.Mat()

      cv.findContours(
        bin,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      )

      const minSide = maxDim * 0.006
      const maxSide = maxDim * 0.08

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)

        try {
          const area = cv.contourArea(contour)

          if (area < minSide * minSide * 0.5) continue
          if (area > maxSide * maxSide) continue

          const rect = cv.minAreaRect(contour)
          const w = rect.size.width
          const h = rect.size.height

          if (w <= 0 || h <= 0) continue
          if (Math.min(w, h) < minSide) continue
          if (Math.max(w, h) > maxSide) continue

          // harus mendekati persegi
          if (Math.min(w, h) / Math.max(w, h) < 0.65) continue

          // harus padat (kotak hitam penuh)
          const extent = area / (w * h)
          if (extent < 0.78) continue

          candidates.push({
            x: rect.center.x,
            y: rect.center.y,
            area,
            extent,
            size: (w + h) / 2,
          })
        } finally {
          contour.delete()
        }
      }

      if (candidates.length < 4) {
        return {
          detected: false,
          message:
            `❌ Marker hitam di pojok LJK belum terdeteksi (${candidates.length}/4).\n` +
            "Pastikan keempat kotak hitam terlihat jelas, cahaya cukup, dan tidak terpotong.",
          candidates,
        }
      }

      // Cari kombinasi 4 marker terbaik: ukuran mirip,
      // bentuk mendekati persegi panjang LJK, luas terbesar.
      const pool = [...candidates]
        .sort((a, b) => b.extent - a.extent)
        .slice(0, 12)

      let best = null

      for (let a = 0; a < pool.length - 3; a++)
        for (let b = a + 1; b < pool.length - 2; b++)
          for (let c = b + 1; c < pool.length - 1; c++)
            for (let d = c + 1; d < pool.length; d++) {
              const group = [pool[a], pool[b], pool[c], pool[d]]

              const sizes = group.map((g) => g.size)
              if (Math.max(...sizes) / Math.min(...sizes) > 1.8) continue

              const o = orderCorners(group)
              if (!o) continue

              const wTop = Math.hypot(o.topRight.x - o.topLeft.x, o.topRight.y - o.topLeft.y)
              const wBot = Math.hypot(o.bottomRight.x - o.bottomLeft.x, o.bottomRight.y - o.bottomLeft.y)
              const hLeft = Math.hypot(o.bottomLeft.x - o.topLeft.x, o.bottomLeft.y - o.topLeft.y)
              const hRight = Math.hypot(o.bottomRight.x - o.topRight.x, o.bottomRight.y - o.topRight.y)

              if (wTop <= 0 || wBot <= 0 || hLeft <= 0 || hRight <= 0) continue

              // sisi berhadapan tidak boleh terlalu beda
              const wr = Math.max(wTop, wBot) / Math.min(wTop, wBot)
              const hr = Math.max(hLeft, hRight) / Math.min(hLeft, hRight)
              if (wr > 1.8 || hr > 1.8) continue

              // rasio LJK: 188 x 308 mm = 0.61
              const ratio = (wTop + wBot) / (hLeft + hRight)
              if (ratio < 0.4 || ratio > 0.9) continue

              const area = quadArea(o)

              if (!best || area > best.area) {
                best = { ordered: o, area, ratio }
              }
            }

      if (!best) {
        return {
          detected: false,
          message:
            "❌ Keempat marker tidak membentuk bidang LJK yang valid.\n" +
            "Pastikan LJK berdiri tegak (tidak terbalik 90°) dan keempat marker terlihat.",
          candidates,
        }
      }

      return {
        detected: true,
        message: "✅ LJK ditemukan.",
        markers: best.ordered,
        candidates,
      }
    } catch (error) {
      console.error("ERROR DETEKSI MARKER:", error)
      return {
        detected: false,
        message: `❌ Gagal mendeteksi LJK: ${error?.message || "error tidak diketahui"}`,
        candidates,
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (blur) blur.delete()
      if (bin) bin.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  }

  // =====================================================
  // WARP: pusat 4 marker -> koordinat aslinya di LJK.
  // Hasil selalu 1050 x 1650 px (5 px/mm), jadi
  // 1 mm di LJK = 5 px, tidak peduli kertas miring.
  // =====================================================

  const warpAnswerSheet = (canvas, m) => {
    const cv = window.cv
    if (!cv || !cv.Mat) return null

    let src = null
    let dst = null
    let srcPts = null
    let dstPts = null
    let matrix = null

    try {
      src = cv.imread(canvas)

      srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        m.topLeft.x, m.topLeft.y,
        m.topRight.x, m.topRight.y,
        m.bottomRight.x, m.bottomRight.y,
        m.bottomLeft.x, m.bottomLeft.y,
      ])

      const left = MARKER_CENTER * PX
      const right = (PAPER_W - MARKER_CENTER) * PX
      const top = MARKER_CENTER * PX
      const bottom = (PAPER_H - MARKER_CENTER) * PX

      dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        left, top,
        right, top,
        right, bottom,
        left, bottom,
      ])

      matrix = cv.getPerspectiveTransform(srcPts, dstPts)

      dst = new cv.Mat()
      cv.warpPerspective(
        src,
        dst,
        matrix,
        new cv.Size(OUT_W, OUT_H),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(255, 255, 255, 255)
      )

      const out = document.createElement("canvas")
      out.width = OUT_W
      out.height = OUT_H
      cv.imshow(out, dst)

      return out
    } catch (error) {
      console.error("ERROR WARP LJK:", error)
      return null
    } finally {
      if (src) src.delete()
      if (dst) dst.delete()
      if (srcPts) srcPts.delete()
      if (dstPts) dstPts.delete()
      if (matrix) matrix.delete()
    }
  }

  // =====================================================
  // KALIBRASI POSISI PER KOLOM
  //
  // Mencari pergeseran (dx, dy) kecil yang membuat titik-titik
  // di garis lingkaran bubble cocok dengan garis tercetak.
  // Ini menutup selisih kecil akibat printer / rounding.
  // =====================================================

  const calibrateColumn = (data, cols, rows, layout, total, colIndex) => {
    const first = colIndex * layout.questionsPerColumn
    const last = Math.min(total, first + layout.questionsPerColumn) - 1

    if (last < first) return { dx: 0, dy: 0 }

    const ringR = (layout.bubbleSize / 2 - 0.16) * PX
    const N = 16
    const cosT = []
    const sinT = []
    for (let k = 0; k < N; k++) {
      cosT.push(Math.cos((2 * Math.PI * k) / N))
      sinT.push(Math.sin((2 * Math.PI * k) / N))
    }

    const centers = []
    for (let q = first; q <= last; q++) {
      for (let c = 0; c < 5; c++) {
        const p = getBubbleCenter(layout, q, c)
        centers.push({ x: p.x * PX, y: p.y * PX })
      }
    }

    let best = { dx: 0, dy: 0, score: -Infinity }
    const range = 2
    const step = 0.25

    for (let dy = -range; dy <= range + 1e-9; dy += step) {
      for (let dx = -range; dx <= range + 1e-9; dx += step) {
        let score = 0

        for (const c of centers) {
          const cx = c.x + dx * PX
          const cy = c.y + dy * PX

          for (let k = 0; k < N; k++) {
            const x = Math.round(cx + ringR * cosT[k])
            const y = Math.round(cy + ringR * sinT[k])
            if (x < 0 || y < 0 || x >= cols || y >= rows) continue
            score += 255 - data[y * cols + x]
          }
        }

        if (score > best.score) best = { dx, dy, score }
      }
    }

    return { dx: best.dx, dy: best.dy }
  }

  // =====================================================
  // BACA JAWABAN
  // =====================================================

  const readStudentAnswers = (canvas, totalQuestions) => {
    const cv = window.cv

    if (!cv || !cv.Mat) {
      return { answers: {}, debug: "❌ OpenCV belum siap.", overlay: null }
    }

    let src = null
    let gray = null
    let bg = null
    let kernel = null
    let norm = null

    try {
      src = cv.imread(canvas)

      gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      // Hilangkan bayangan / cahaya tidak rata:
      // estimasi latar putih lalu bagi.
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(51, 51))
      bg = new cv.Mat()
      cv.morphologyEx(gray, bg, cv.MORPH_CLOSE, kernel)
      cv.GaussianBlur(bg, bg, new cv.Size(31, 31), 0)

      norm = new cv.Mat()
      cv.divide(gray, bg, norm, 255)

      const data = norm.data
      const cols = norm.cols
      const rows = norm.rows

      const layout = getLJKLayout(totalQuestions)

      // kalibrasi tiap kolom
      const offsets = []
      for (let c = 0; c < layout.columnCount; c++) {
        offsets.push(calibrateColumn(data, cols, rows, layout, totalQuestions, c))
      }

      const innerR = (layout.bubbleSize / 2) * 0.62 * PX

      const measure = (cx, cy) => {
        const x0 = Math.floor(cx - innerR)
        const x1 = Math.ceil(cx + innerR)
        const y0 = Math.floor(cy - innerR)
        const y1 = Math.ceil(cy + innerR)

        let sum = 0
        let n = 0

        for (let y = y0; y <= y1; y++) {
          if (y < 0 || y >= rows) continue
          for (let x = x0; x <= x1; x++) {
            if (x < 0 || x >= cols) continue
            const dx = x - cx
            const dy = y - cy
            if (dx * dx + dy * dy > innerR * innerR) continue
            sum += data[y * cols + x]
            n++
          }
        }

        // 0 = putih (kosong), 1 = hitam (terisi penuh)
        return n ? 1 - sum / n / 255 : 0
      }

      const answers = {}
      const debugData = []
      const marks = [] // untuk overlay

      let answeredCount = 0
      let emptyCount = 0
      let doubleCount = 0

      for (let q = 0; q < totalQuestions; q++) {
        const number = q + 1

        const dark = []
        const centers = []

        for (let c = 0; c < 5; c++) {
          const p = getBubbleCenter(layout, q, c)
          const off = offsets[p.col] || { dx: 0, dy: 0 }

          const cx = (p.x + off.dx) * PX
          const cy = (p.y + off.dy) * PX

          centers.push({ x: cx, y: cy })
          dark.push(measure(cx, cy))
        }

        // bandingkan dengan bubble kosong di baris yang sama
        const baseline = median(dark)
        const ink = dark.map((v) => v - baseline)

        const ranked = ink
          .map((value, index) => ({ value, index }))
          .sort((a, b) => b.value - a.value)

        const top = ranked[0]
        const second = ranked[1]

        let result = ""
        let state = "empty"

        if (top.value < FILL_MIN) {
          emptyCount++
          result = ""
          state = "empty"
        } else if (second.value >= FILL_MIN && second.value >= top.value * 0.6) {
          doubleCount++
          result = "GANDA"
          state = "double"
        } else {
          answeredCount++
          result = CHOICES[top.index]
          state = "ok"
        }

        answers[number] = result

        marks.push({
          centers,
          state,
          chosen: state === "ok" ? top.index : -1,
          doubles: state === "double" ? [top.index, second.index] : [],
        })

        debugData.push({
          no: number,
          A: +ink[0].toFixed(2),
          B: +ink[1].toFixed(2),
          C: +ink[2].toFixed(2),
          D: +ink[3].toFixed(2),
          E: +ink[4].toFixed(2),
          jawaban: result || "KOSONG",
        })
      }

      console.log("Offset kolom (mm):", offsets)
      console.table(debugData)

      // ---- OVERLAY VERIFIKASI ----
      const overlay = document.createElement("canvas")
      overlay.width = canvas.width
      overlay.height = canvas.height

      const ctx = overlay.getContext("2d")
      ctx.drawImage(canvas, 0, 0)

      const rr = (layout.bubbleSize / 2) * PX

      marks.forEach((m) => {
        m.centers.forEach((c, i) => {
          ctx.beginPath()
          ctx.arc(c.x, c.y, rr, 0, Math.PI * 2)

          if (m.chosen === i) {
            ctx.strokeStyle = "#16a34a"
            ctx.lineWidth = 3
          } else if (m.doubles.includes(i)) {
            ctx.strokeStyle = "#dc2626"
            ctx.lineWidth = 3
          } else {
            ctx.strokeStyle = "rgba(100,116,139,0.45)"
            ctx.lineWidth = 1
          }
          ctx.stroke()
        })
      })

      const debug =
        `📝 OMR | Kolom: ${layout.columnCount}` +
        ` | Terbaca: ${answeredCount}/${totalQuestions}` +
        ` | Kosong: ${emptyCount}` +
        ` | Ganda: ${doubleCount}`

      return { answers, debug, overlay }
    } catch (error) {
      console.error("ERROR READ OMR:", error)
      return {
        answers: {},
        debug: `❌ Gagal membaca jawaban: ${error?.message || "error tidak diketahui"}`,
        overlay: null,
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (bg) bg.delete()
      if (kernel) kernel.delete()
      if (norm) norm.delete()
    }
  }

  // =====================================================
  // HANDLE SCAN
  // =====================================================

  const handleScan = async () => {
    if (!videoRef.current) return

    setScanning(true)
    setMessage("")
    setPreview(null)
    setCorrectionResult(null)

    try {
      const answerKeys = await getAnswerKey()

      if (answerKeys.length === 0) {
        setMessage("Kunci jawaban untuk ujian ini belum tersedia.")
        setScanning(false)
        return
      }

      const video = videoRef.current

      if (!video.videoWidth || !video.videoHeight) {
        setMessage("Kamera belum siap. Tunggu beberapa detik lalu coba lagi.")
        setScanning(false)
        return
      }

      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const context = canvas.getContext("2d", { willReadFrequently: true })
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      // ---- DETEKSI MARKER ----
      setMessage("Mencari marker LJK...")

      const detection = detectMarkers(canvas)

      if (!detection.detected) {
        // tampilkan kandidat marker agar mudah di-debug
        const dbg = document.createElement("canvas")
        dbg.width = canvas.width
        dbg.height = canvas.height
        const dctx = dbg.getContext("2d")
        dctx.drawImage(canvas, 0, 0)
        dctx.strokeStyle = "#facc15"
        dctx.lineWidth = 4
        ;(detection.candidates || []).forEach((c) => {
          dctx.strokeRect(c.x - c.size, c.y - c.size, c.size * 2, c.size * 2)
        })

        setMessage(detection.message)
        setPreview(dbg.toDataURL("image/jpeg", 0.85))
        setScanning(false)
        return
      }

      // ---- WARP ----
      setMessage("Meluruskan LJK...")

      const corrected = warpAnswerSheet(canvas, detection.markers)

      if (!corrected) {
        setMessage("❌ Gagal meluruskan LJK.")
        setScanning(false)
        return
      }

      // ---- BACA ----
      setMessage("Membaca jawaban siswa...")

      const scanResult = readStudentAnswers(corrected, answerKeys.length)

      setPreview(
        (scanResult.overlay || corrected).toDataURL("image/jpeg", 0.92)
      )

      const detectedAnswers = scanResult.answers || {}
      setStudentAnswers(detectedAnswers)

      // ---- KOREKSI ----
      const result = calculateResult(detectedAnswers, answerKeys)
      setCorrectionResult(result)

      setMessage(`${scanResult.debug} | Koreksi selesai! 🎉`)
    } catch (error) {
      console.error("SCAN ERROR DETAIL:", error)
      setMessage(`Terjadi kesalahan: ${error?.message || "tidak diketahui"}`)
    }

    setScanning(false)
  }

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 md:text-3xl">
            Koreksi Lembar Jawaban
          </h1>
          <p className="mt-2 text-gray-500">
            Pilih ujian kemudian scan lembar jawaban siswa.
          </p>
        </div>

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
              setPreview(null)
              setMessage("")
            }}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-slate-500"
          >
            <option value="">-- Pilih ujian --</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
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

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="text-xl font-bold text-slate-800">
            Scan Lembar Jawaban
          </h2>
          <p className="mt-1 text-gray-500">
            Pastikan seluruh LJK dan 4 kotak hitam di pojok terlihat di kamera.
            Kertas tidak harus lurus.
          </p>

          <div className="relative mt-5 overflow-hidden rounded-2xl bg-black">
            {cameraOpen ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="block min-h-[400px] w-full object-contain"
                />

                <div className="absolute left-0 right-0 top-4 text-center">
                  <span className="rounded-full bg-black/60 px-4 py-2 text-sm text-white">
                    Pastikan 4 kotak hitam di pojok LJK terlihat
                  </span>
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                <div className="text-6xl">📷</div>
                <h3 className="mt-4 text-xl font-bold text-white">
                  Scanner Lembar Jawaban
                </h3>
                <p className="mt-2 max-w-md text-gray-300">
                  Kamera akan digunakan untuk memindai lembar jawaban siswa.
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
                {scanning ? "⏳ Memindai..." : "🔍 Scan Lembar Jawaban"}
              </button>
            </div>
          )}

          {message && (
            <div className="mt-5 whitespace-pre-line rounded-xl bg-gray-100 p-4 text-center text-sm text-gray-700">
              {message}
            </div>
          )}

          {correctionResult && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-2xl font-bold text-slate-800">
                🎉 Hasil Koreksi
              </h2>

              <p className="mt-2 text-gray-500">
                Nama Siswa:{" "}
                <span className="font-semibold text-slate-800">
                  {studentName}
                </span>
              </p>

              <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-xl bg-blue-50 p-5 text-center">
                  <p className="text-sm text-gray-500">Nilai</p>
                  <p className="mt-2 text-4xl font-bold text-blue-600">
                    {correctionResult.score}
                  </p>
                </div>

                <div className="rounded-xl bg-green-50 p-5 text-center">
                  <p className="text-sm text-gray-500">Benar</p>
                  <p className="mt-2 text-4xl font-bold text-green-600">
                    {correctionResult.correct}
                  </p>
                </div>

                <div className="rounded-xl bg-red-50 p-5 text-center">
                  <p className="text-sm text-gray-500">
                    Salah
                    {correctionResult.double > 0 &&
                      ` (${correctionResult.double} ganda)`}
                  </p>
                  <p className="mt-2 text-4xl font-bold text-red-600">
                    {correctionResult.wrong}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-100 p-5 text-center">
                  <p className="text-sm text-gray-500">Kosong</p>
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
                      <tr key={item.number} className="border-b">
                        <td className="p-3">{item.number}</td>
                        <td className="p-3">{item.studentAnswer || "-"}</td>
                        <td className="p-3">{item.correctAnswer}</td>
                        <td className="p-3">
                          {item.status === "correct" && "✅ Benar"}
                          {item.status === "wrong" && "❌ Salah"}
                          {item.status === "double" && "⚠️ Ganda (salah)"}
                          {item.status === "empty" && "⬜ Kosong"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="mb-1 font-bold text-slate-800">
                Hasil Scan yang Sudah Diluruskan
              </h3>
              <p className="mb-3 text-sm text-gray-500">
                Lingkaran hijau = jawaban terbaca, merah = ganda.
              </p>

              <div className="overflow-hidden rounded-xl bg-gray-100">
                <img
                  src={preview}
                  alt="Hasil scan"
                  className="block w-full object-contain"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Correction