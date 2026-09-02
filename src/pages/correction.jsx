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

    return data || []
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
        studentAnswers[key.question_number] || ""

      const correctAnswer = key.answer

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
    return {
      detected: false,
      message: "OpenCV belum siap.",
    }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let binary = null
  let contours = null
  let hierarchy = null
  let kernel = null

  try {
    src = cv.imread(canvas)

    const imageWidth = src.cols
    const imageHeight = src.rows

    console.log(
      "UKURAN GAMBAR:",
      imageWidth,
      "x",
      imageHeight
    )

    // =========================
    // 1. GRAYSCALE
    // =========================

    gray = new cv.Mat()

    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    )

    // =========================
    // 2. THRESHOLD
    // =========================

    binary = new cv.Mat()

    cv.threshold(
      gray,
      binary,
      120,
      255,
      cv.THRESH_BINARY_INV
    )

    // =========================
    // 3. MORPHOLOGY
    // Menyatukan bagian marker
    // yang mungkin terpecah
    // =========================

    kernel = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(5, 5)
    )

    cv.morphologyEx(
      binary,
      binary,
      cv.MORPH_CLOSE,
      kernel
    )

    // =========================
    // 4. CARI CONTOUR
    // =========================

    contours = new cv.MatVector()
    hierarchy = new cv.Mat()

    cv.findContours(
      binary,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    )

    const candidates = []

    // =========================
    // 5. FILTER KANDIDAT
    // =========================

    for (
      let i = 0;
      i < contours.size();
      i++
    ) {
      const contour =
        contours.get(i)

      const area =
        cv.contourArea(contour)

      const rect =
        cv.boundingRect(contour)

      const width = rect.width
      const height = rect.height

      // Ukuran minimal
      if (
        width < 12 ||
        height < 12
      ) {
        contour.delete()
        continue
      }

      // Ukuran maksimal
      if (
        width > imageWidth * 0.25 ||
        height > imageHeight * 0.25
      ) {
        contour.delete()
        continue
      }

      // Rasio bentuk harus mendekati kotak
      const ratio =
        width / height

      if (
        ratio < 0.65 ||
        ratio > 1.5
      ) {
        contour.delete()
        continue
      }

      // =========================
      // RECTANGULARITY
      // =========================

      const rectArea =
        width * height

      const rectangularity =
        area / rectArea

      if (rectangularity < 0.45) {
        contour.delete()
        continue
      }

      // =========================
      // APPROX POLYGON
      // =========================

      const perimeter =
        cv.arcLength(
          contour,
          true
        )

      const approx =
        new cv.Mat()

      cv.approxPolyDP(
        contour,
        approx,
        0.04 * perimeter,
        true
      )

      if (
        approx.rows >= 4 &&
        approx.rows <= 6
      ) {
        candidates.push({
          x:
            rect.x +
            rect.width / 2,

          y:
            rect.y +
            rect.height / 2,

          width,
          height,
          area,
          rectangularity,
        })
      }

      approx.delete()
      contour.delete()
    }

    console.log(
      "SEMUA KANDIDAT MARKER:",
      candidates
    )

    // =========================
    // 6. HARUS ADA MINIMAL 4
    // =========================

    if (candidates.length < 4) {
      return {
        detected: false,
        message:
          `Marker hitam terdeteksi ${candidates.length}/4. Pastikan keempat marker terlihat jelas.`,
      }
    }

    // =========================
    // 7. HITUNG JARAK KE
    //    4 SUDUT GAMBAR
    // =========================

    const distance = (
      x1,
      y1,
      x2,
      y2
    ) => {
      return Math.sqrt(
        Math.pow(x1 - x2, 2) +
        Math.pow(y1 - y2, 2)
      )
    }

    const corners = {
      topLeft: {
        x: 0,
        y: 0,
      },

      topRight: {
        x: imageWidth,
        y: 0,
      },

      bottomLeft: {
        x: 0,
        y: imageHeight,
      },

      bottomRight: {
        x: imageWidth,
        y: imageHeight,
      },
    }

    // =========================
    // 8. CARI KANDIDAT TERDEKAT
    //    KE MASING-MASING SUDUT
    // =========================

    const findNearest = (
      corner,
      used
    ) => {
      let best = null
      let bestDistance = Infinity

      candidates.forEach(
        (candidate, index) => {
          if (used.has(index)) {
            return
          }

          const d = distance(
            candidate.x,
            candidate.y,
            corner.x,
            corner.y
          )

          if (d < bestDistance) {
            bestDistance = d
            best = {
              ...candidate,
              index,
              distance: d,
            }
          }
        }
      )

      return best
    }

    const used = new Set()

    const topLeft =
      findNearest(
        corners.topLeft,
        used
      )

    if (topLeft) {
      used.add(topLeft.index)
    }

    const topRight =
      findNearest(
        corners.topRight,
        used
      )

    if (topRight) {
      used.add(topRight.index)
    }

    const bottomLeft =
      findNearest(
        corners.bottomLeft,
        used
      )

    if (bottomLeft) {
      used.add(bottomLeft.index)
    }

    const bottomRight =
      findNearest(
        corners.bottomRight,
        used
      )

    if (bottomRight) {
      used.add(bottomRight.index)
    }

    // =========================
    // 9. CEK 4 MARKER
    // =========================

    if (
      !topLeft ||
      !topRight ||
      !bottomLeft ||
      !bottomRight
    ) {
      return {
        detected: false,
        message:
          "4 marker belum dapat ditentukan. Coba posisikan seluruh LJK masuk kamera.",
      }
    }

    // =========================
    // 10. BATAS JARAK MARKER
    // =========================

    const maxCornerDistance =
      Math.max(
        imageWidth,
        imageHeight
      ) * 0.55

    if (
      topLeft.distance >
        maxCornerDistance ||
      topRight.distance >
        maxCornerDistance ||
      bottomLeft.distance >
        maxCornerDistance ||
      bottomRight.distance >
        maxCornerDistance
    ) {
      console.log(
        "Jarak marker terlalu jauh:",
        {
          topLeft: topLeft.distance,
          topRight: topRight.distance,
          bottomLeft: bottomLeft.distance,
          bottomRight: bottomRight.distance,
        }
      )

      return {
        detected: false,
        message:
          "Marker belum berada di posisi sudut LJK. Pastikan seluruh lembar terlihat.",
      }
    }

    // =========================
    // 11. CEK POSISI RELATIF
    // =========================

    if (
      topLeft.x >= topRight.x ||
      bottomLeft.x >= bottomRight.x ||
      topLeft.y >= bottomLeft.y ||
      topRight.y >= bottomRight.y
    ) {
      console.log(
        "Susunan marker tidak valid:",
        {
          topLeft,
          topRight,
          bottomLeft,
          bottomRight,
        }
      )

      return {
        detected: false,
        message:
          "Posisi 4 marker belum membentuk sudut LJK dengan benar.",
      }
    }

    // =========================
    // 12. BUAT HASIL MARKER
    // =========================

    const markers = {
      topLeft: {
        x: topLeft.x,
        y: topLeft.y,
      },

      topRight: {
        x: topRight.x,
        y: topRight.y,
      },

      bottomLeft: {
        x: bottomLeft.x,
        y: bottomLeft.y,
      },

      bottomRight: {
        x: bottomRight.x,
        y: bottomRight.y,
      },
    }

    console.log(
      "================================"
    )

    console.log(
      "4 MARKER BERHASIL TERDETEKSI"
    )

    console.log(
      "TOP LEFT:",
      markers.topLeft
    )

    console.log(
      "TOP RIGHT:",
      markers.topRight
    )

    console.log(
      "BOTTOM LEFT:",
      markers.bottomLeft
    )

    console.log(
      "BOTTOM RIGHT:",
      markers.bottomRight
    )

    console.log(
      "================================"
    )

    return {
      detected: true,

      message:
        "4 marker hitam berhasil ditemukan! ✅",

      markers,
    }

  } catch (error) {
    console.error(
      "ERROR DETEKSI MARKER:",
      error
    )

    return {
      detected: false,
      message:
        "Gagal mendeteksi marker LJK.",
    }

  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (binary) binary.delete()
    if (contours) contours.delete()
    if (hierarchy) hierarchy.delete()
    if (kernel) kernel.delete()
  }
}
  // =========================
  // LURUSKAN FOTO LJK
  // =========================

const warpAnswerSheet = (canvas, markers) => {
  const cv = window.cv

  let src = null
  let dst = null
  let srcTri = null
  let dstTri = null
  let matrix = null

  try {
    src = cv.imread(canvas)

    // ==========================================
    // UKURAN HASIL AKHIR
    // ==========================================

    const width = 900
    const height = 1200

    // ==========================================
    // AMBIL 4 MARKER
    // ==========================================

    const points = [
      {
        x: Number(markers.topLeft.x),
        y: Number(markers.topLeft.y),
      },

      {
        x: Number(markers.topRight.x),
        y: Number(markers.topRight.y),
      },

      {
        x: Number(markers.bottomRight.x),
        y: Number(markers.bottomRight.y),
      },

      {
        x: Number(markers.bottomLeft.x),
        y: Number(markers.bottomLeft.y),
      },
    ]

    console.log(
      "================================="
    )

    console.log(
      "MARKER UNTUK WARP:",
      points
    )

    // ==========================================
    // URUTKAN BERDASARKAN GEOMETRI
    // ==========================================

    const centerX =
      points.reduce(
        (sum, p) => sum + p.x,
        0
      ) / points.length

    const centerY =
      points.reduce(
        (sum, p) => sum + p.y,
        0
      ) / points.length

    const ordered = [
      ...points,
    ].sort((a, b) => {
      const angleA =
        Math.atan2(
          a.y - centerY,
          a.x - centerX
        )

      const angleB =
        Math.atan2(
          b.y - centerY,
          b.x - centerX
        )

      return angleA - angleB
    })

    // ==========================================
    // CARI TITIK EKSTREM
    // ==========================================

    const topLeft =
      ordered.reduce(
        (best, p) =>
          p.x + p.y <
          best.x + best.y
            ? p
            : best
      )

    const bottomRight =
      ordered.reduce(
        (best, p) =>
          p.x + p.y >
          best.x + best.y
            ? p
            : best
      )

    const topRight =
      ordered.reduce(
        (best, p) =>
          p.x - p.y >
          best.x - best.y
            ? p
            : best
      )

    const bottomLeft =
      ordered.reduce(
        (best, p) =>
          p.x - p.y <
          best.x - best.y
            ? p
            : best
      )

    console.log(
      "MARKER TERURUT:",
      {
        topLeft,
        topRight,
        bottomRight,
        bottomLeft,
      }
    )

    // ==========================================
    // CEK DUPLIKAT
    // ==========================================

    const ids = [
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
    ].map(
      (p) =>
        `${Math.round(p.x)}-${Math.round(p.y)}`
    )

    if (
      new Set(ids).size !== 4
    ) {
      console.error(
        "Marker tidak unik:",
        ids
      )

      return null
    }

    // ==========================================
    // TITIK SUMBER
    //
    // TL → TR → BR → BL
    // ==========================================

    const srcPoints = [
      topLeft.x,
      topLeft.y,

      topRight.x,
      topRight.y,

      bottomRight.x,
      bottomRight.y,

      bottomLeft.x,
      bottomLeft.y,
    ]

    // ==========================================
    // TITIK TUJUAN
    // ==========================================

    const dstPoints = [
      0,
      0,

      width - 1,
      0,

      width - 1,
      height - 1,

      0,
      height - 1,
    ]

    console.log(
      "SOURCE POINTS:",
      srcPoints
    )

    console.log(
      "DESTINATION POINTS:",
      dstPoints
    )

    // ==========================================
    // MAT
    // ==========================================

    srcTri = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      srcPoints
    )

    dstTri = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      dstPoints
    )

    // ==========================================
    // PERSPECTIVE MATRIX
    // ==========================================

    matrix =
      cv.getPerspectiveTransform(
        srcTri,
        dstTri
      )

    console.log(
      "PERSPECTIVE MATRIX:",
      matrix
    )

    // ==========================================
    // WARP
    // ==========================================

    dst = new cv.Mat()

    cv.warpPerspective(
      src,
      dst,
      matrix,
      new cv.Size(
        width,
        height
      ),
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      new cv.Scalar(
        255,
        255,
        255,
        255
      )
    )

    // ==========================================
    // CANVAS HASIL
    // ==========================================

    const resultCanvas =
      document.createElement(
        "canvas"
      )

    resultCanvas.width =
      width

    resultCanvas.height =
      height

    cv.imshow(
      resultCanvas,
      dst
    )

    console.log(
      "WARP SELESAI:",
      width,
      "x",
      height
    )

    console.log(
      "================================="
    )

    return resultCanvas

  } catch (error) {
    console.error(
      "ERROR WARP:",
      error
    )

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
  // BACA JAWABAN DINAMIS
  // =========================

  const readStudentAnswers = (
  canvas,
  totalQuestions
) => {
  if (!window.cv || !window.cv.Mat) {
    return {}
  }

  const cv = window.cv

  let src = null
  let gray = null
  let binary = null

  try {
    src = cv.imread(canvas)

    gray = new cv.Mat()

    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    )

    binary = new cv.Mat()

    cv.threshold(
      gray,
      binary,
      0,
      255,
      cv.THRESH_BINARY_INV +
        cv.THRESH_OTSU
    )

    const answers = {}

    /*
      LAYOUT LJK

      Ukuran hasil warp:
      900 x 1200

      Area jawaban berada
      di bagian atas kertas.
    */

    const columns = 2

    const questionsPerColumn =
      Math.ceil(totalQuestions / columns)

    /*
      POSISI AREA JAWABAN
    */

    const startY = 245
    const endY = 470

    /*
      KOLOM KIRI DAN KANAN
    */

    const leftColumnStartX = 170
    const rightColumnStartX = 490

    /*
      JARAK ANTAR BARIS
    */

    const rowHeight =
      (endY - startY) /
      questionsPerColumn

    /*
      JARAK BUBBLE A-E
    */

    const bubbleSize = 22

    const bubbleGap = 27

    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E",
    ]

    for (
      let questionIndex = 0;
      questionIndex < totalQuestions;
      questionIndex++
    ) {
      const questionNumber =
        questionIndex + 1

      const columnIndex =
        Math.floor(
          questionIndex /
          questionsPerColumn
        )

      const rowIndex =
        questionIndex %
        questionsPerColumn

      /*
        Posisi Y setiap soal
      */

      const rowY =
        startY +
        rowIndex * rowHeight

      /*
        Tentukan kolom kiri / kanan
      */

      const columnStartX =
        columnIndex === 0
          ? leftColumnStartX
          : rightColumnStartX

      let highestInk = 0
      let secondHighestInk = 0

      let selectedAnswer = ""

      for (
        let choiceIndex = 0;
        choiceIndex < choices.length;
        choiceIndex++
      ) {
        /*
          Posisi bubble
        */

        const bubbleX =
          columnStartX +
          choiceIndex * bubbleGap

        const bubbleY =
          rowY

        /*
          Ambil bagian TENGAH bubble.

          Jangan ambil garis lingkaran,
          karena yang kita cari adalah
          tinta di dalam bubble.
        */

        const padding = 5

        const roiX =
          Math.round(
            bubbleX + padding
          )

        const roiY =
          Math.round(
            bubbleY + padding
          )

        const roiWidth =
          Math.round(
            bubbleSize -
            padding * 2
          )

        const roiHeight =
          Math.round(
            bubbleSize -
            padding * 2
          )

        /*
          Pastikan tidak keluar gambar
        */

        if (
          roiX < 0 ||
          roiY < 0 ||
          roiX + roiWidth >
            binary.cols ||
          roiY + roiHeight >
            binary.rows
        ) {
          continue
        }

        const rect =
          new cv.Rect(
            roiX,
            roiY,
            roiWidth,
            roiHeight
          )

        const roi =
          binary.roi(rect)

        const ink =
          cv.countNonZero(roi)

        roi.delete()

        console.log(
          `Soal ${questionNumber} - ${choices[choiceIndex]}:`,
          ink
        )

        if (ink > highestInk) {
          secondHighestInk =
            highestInk

          highestInk = ink

          selectedAnswer =
            choices[choiceIndex]
        } else if (
          ink > secondHighestInk
        ) {
          secondHighestInk = ink
        }
      }

      /*
        Tentukan apakah benar-benar diisi
      */

      const minimumInk = 15

      /*
        Kalau dua bubble hampir sama,
        anggap kosong supaya tidak salah
        memilih jawaban.
      */

      const isAmbiguous =
        secondHighestInk >
        highestInk * 0.75

      if (
        highestInk < minimumInk ||
        isAmbiguous
      ) {
        answers[questionNumber] = ""
      } else {
        answers[questionNumber] =
          selectedAnswer
      }
    }

    console.log(
      "HASIL JAWABAN:",
      answers
    )

    return answers

  } catch (error) {
    console.error(
      "Error membaca jawaban:",
      error
    )

    return {}

  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (binary) binary.delete()
  }
}

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

      // Tampilkan hasil LJK yang sudah lurus
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
      const detectedAnswers =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      console.log(
        "Jawaban siswa:",
        detectedAnswers
      )

      setStudentAnswers(
        detectedAnswers
      )

      // Hitung hasil
      const resultCorrection = calculateResult(
        detectedAnswers,
        answerKeys
      )

      setCorrectionResult(resultCorrection)

      setMessage("Koreksi selesai! 🎉")
    } catch (error) {
      console.error(
        "Scan error:",
        error
      )

      setMessage(
        "Terjadi kesalahan saat memindai."
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
                  className="max-h-[700px] w-full object-contain"
                />
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  )
}

export default correction