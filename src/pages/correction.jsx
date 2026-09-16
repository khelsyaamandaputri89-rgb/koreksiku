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

// =========================
// DETEKSI LJK - TAHAN MIRING
// =========================
// =====================================================
// DETEKSI LJK
// LEBIH LONGGAR:
// - LJK tidak harus tepat di tengah
// - LJK boleh miring
// - LJK boleh bergeser
// - selama kertas terlihat cukup jelas
// =====================================================

const detectAnswerSheet = (canvas) => {
  if (!window.cv || !window.cv.Mat) {
    return {
      detected: false,
      message: "OpenCV belum siap."
    }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blur = null
  let edges = null
  let dilated = null
  let contours = null
  let hierarchy = null
  let kernel = null

  try {
    src = cv.imread(canvas)

    const imageWidth = src.cols
    const imageHeight = src.rows
    const imageArea =
      imageWidth * imageHeight

    // =====================================================
    // 1. GRAYSCALE
    // =====================================================

    gray = new cv.Mat()

    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    )

    // =====================================================
    // 2. BLUR
    // =====================================================

    blur = new cv.Mat()

    cv.GaussianBlur(
      gray,
      blur,
      new cv.Size(5, 5),
      0
    )

    // =====================================================
    // 3. EDGE
    // =====================================================

    edges = new cv.Mat()

    cv.Canny(
      blur,
      edges,
      40,
      120
    )

    // =====================================================
    // 4. DILATE
    // =====================================================

    kernel =
      cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(5, 5)
      )

    dilated = new cv.Mat()

    cv.dilate(
      edges,
      dilated,
      kernel,
      new cv.Point(-1, -1),
      2
    )

    // =====================================================
    // 5. CONTOUR
    // =====================================================

    contours =
      new cv.MatVector()

    hierarchy =
      new cv.Mat()

    cv.findContours(
      dilated,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    )

    // =====================================================
    // 6. CARI KANDIDAT LJK
    // =====================================================

    const candidates = []

    for (
      let i = 0;
      i < contours.size();
      i++
    ) {
      const contour =
        contours.get(i)

      const area =
        cv.contourArea(contour)

      // LJK harus cukup besar
      if (
        area <
          imageArea * 0.08 ||
        area >
          imageArea * 0.90
      ) {
        contour.delete()
        continue
      }

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
        0.02 * perimeter,
        true
      )

      // Harus 4 sisi
      if (
        approx.rows !== 4
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      const points = []

      for (
        let p = 0;
        p < 4;
        p++
      ) {
        points.push({
          x:
            approx.data32S[
              p * 2
            ],
          y:
            approx.data32S[
              p * 2 + 1
            ]
        })
      }

      // =================================================
      // 7. URUTKAN SUDUT
      // =================================================

      const topLeft =
        points.reduce(
          (best, p) =>
            p.x + p.y <
            best.x + best.y
              ? p
              : best
        )

      const bottomRight =
        points.reduce(
          (best, p) =>
            p.x + p.y >
            best.x + best.y
              ? p
              : best
        )

      const topRight =
        points.reduce(
          (best, p) =>
            p.x - p.y >
            best.x - best.y
              ? p
              : best
        )

      const bottomLeft =
        points.reduce(
          (best, p) =>
            p.x - p.y <
            best.x - best.y
              ? p
              : best
        )

      // =================================================
      // 8. UKURAN SISI
      // =================================================

      const widthTop =
        Math.hypot(
          topRight.x -
            topLeft.x,
          topRight.y -
            topLeft.y
        )

      const widthBottom =
        Math.hypot(
          bottomRight.x -
            bottomLeft.x,
          bottomRight.y -
            bottomLeft.y
        )

      const heightLeft =
        Math.hypot(
          bottomLeft.x -
            topLeft.x,
          bottomLeft.y -
            topLeft.y
        )

      const heightRight =
        Math.hypot(
          bottomRight.x -
            topRight.x,
          bottomRight.y -
            topRight.y
        )

      const averageWidth =
        (
          widthTop +
          widthBottom
        ) / 2

      const averageHeight =
        (
          heightLeft +
          heightRight
        ) / 2

      if (
        averageWidth <= 0 ||
        averageHeight <= 0
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      const ratio =
        averageWidth /
        averageHeight

      // =================================================
      // 9. RASIO F4
      // =================================================

      const f4Ratio =
        210 / 330

      const ratioDifference =
        Math.abs(
          ratio - f4Ratio
        )

      /*
       * F4 portrait sekitar 0.636.
       *
       * Kita masih beri toleransi karena
       * kamera bisa miring.
       */
      if (
        ratio < 0.48 ||
        ratio > 0.82
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      // =================================================
      // 10. CEK KEMIRINGAN SISI
      // =================================================

      const verticalDifference =
        Math.abs(
          heightLeft -
            heightRight
        ) /
        averageHeight

      const horizontalDifference =
        Math.abs(
          widthTop -
            widthBottom
        ) /
        averageWidth

      /*
       * Kalau perbedaan sisi terlalu besar,
       * kemungkinan bukan kertas.
       */
      if (
        verticalDifference >
          0.45 ||
        horizontalDifference >
          0.45
      ) {
        approx.delete()
        contour.delete()
        continue
      }

      // =================================================
      // 11. SCORE KANDIDAT
      // =================================================

      /*
       * Jangan hanya memilih area terbesar.
       *
       * Kandidat yang bentuknya paling mendekati
       * F4 akan mendapat nilai lebih tinggi.
       */

      const ratioScore =
        Math.max(
          0,
          1 -
            ratioDifference /
              0.20
        )

      const sizeScore =
        Math.min(
          area /
            (imageArea * 0.50),
          1
        )

      const rectangleScore =
        Math.max(
          0,
          1 -
            (
              verticalDifference +
              horizontalDifference
            ) /
              0.90
        )

      const score =
        ratioScore * 0.55 +
        sizeScore * 0.25 +
        rectangleScore * 0.20

      candidates.push({
        area,
        ratio,
        score,
        points: [
          topLeft,
          topRight,
          bottomRight,
          bottomLeft
        ]
      })

      approx.delete()
      contour.delete()
    }

    // =====================================================
    // 12. TIDAK ADA LJK
    // =====================================================

    if (
      candidates.length === 0
    ) {
      return {
        detected: false,
        message:
          "❌ LJK belum terdeteksi. Pastikan seluruh kertas terlihat."
      }
    }

    // =====================================================
    // 13. PILIH KANDIDAT TERBAIK
    // =====================================================

    candidates.sort(
      (a, b) =>
        b.score -
        a.score
    )

    const best =
      candidates[0]

    const [
      topLeft,
      topRight,
      bottomRight,
      bottomLeft
    ] = best.points

    // =====================================================
    // 14. VALIDASI UKURAN MINIMAL
    // =====================================================

    const paperWidth =
      (
        Math.hypot(
          topRight.x -
            topLeft.x,
          topRight.y -
            topLeft.y
        ) +
        Math.hypot(
          bottomRight.x -
            bottomLeft.x,
          bottomRight.y -
            bottomLeft.y
        )
      ) / 2

    const paperHeight =
      (
        Math.hypot(
          bottomLeft.x -
            topLeft.x,
          bottomLeft.y -
            topLeft.y
        ) +
        Math.hypot(
          bottomRight.x -
            topRight.x,
          bottomRight.y -
            topRight.y
        )
      ) / 2

    if (
      paperWidth <
        imageWidth * 0.20 ||
      paperHeight <
        imageHeight * 0.30
    ) {
      return {
        detected: false,
        message:
          "❌ LJK terlalu kecil. Dekatkan kertas ke kamera."
      }
    }

    // =====================================================
    // 15. MARKERS
    // =====================================================

    const markers = {
      topLeft: {
        x: topLeft.x,
        y: topLeft.y
      },

      topRight: {
        x: topRight.x,
        y: topRight.y
      },

      bottomLeft: {
        x: bottomLeft.x,
        y: bottomLeft.y
      },

      bottomRight: {
        x: bottomRight.x,
        y: bottomRight.y
      }
    }

    console.log(
      "===== LJK TERDETEKSI ====="
    )

    console.log(
      "Jumlah kandidat:",
      candidates.length
    )

    console.log(
      "Score:",
      best.score
    )

    console.log(
      "Rasio:",
      best.ratio
    )

    console.log(
      "TL:",
      markers.topLeft
    )

    console.log(
      "TR:",
      markers.topRight
    )

    console.log(
      "BL:",
      markers.bottomLeft
    )

    console.log(
      "BR:",
      markers.bottomRight
    )

    return {
      detected: true,
      message:
        "✅ LJK berhasil ditemukan.",
      markers
    }

  } catch (error) {
    console.error(
      "ERROR DETEKSI LJK:",
      error
    )

    return {
      detected: false,
      message:
        "❌ Gagal mendeteksi LJK."
    }

  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blur) blur.delete()
    if (edges) edges.delete()
    if (dilated) dilated.delete()
    if (contours)
      contours.delete()
    if (hierarchy)
      hierarchy.delete()
    if (kernel)
      kernel.delete()
  }
}
  // =========================
  // LURUSKAN FOTO LJK
  // =========================

const warpAnswerSheet = (
  canvas,
  markers
) => {
  const cv = window.cv

  let src = null
  let dst = null
  let srcTri = null
  let dstTri = null
  let matrix = null

  try {
    src = cv.imread(canvas)

    const width = 840
    const height = 1320

    // ================================================
    // SOURCE
    // ================================================

    const srcPoints = [
      markers.topLeft.x,
      markers.topLeft.y,

      markers.topRight.x,
      markers.topRight.y,

      markers.bottomRight.x,
      markers.bottomRight.y,

      markers.bottomLeft.x,
      markers.bottomLeft.y
    ]

    // ================================================
    // DESTINATION
    // ================================================

    const dstPoints = [
      0,
      0,

      width - 1,
      0,

      width - 1,
      height - 1,

      0,
      height - 1
    ]

    srcTri =
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        srcPoints
      )

    dstTri =
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        dstPoints
      )

    // ================================================
    // PERSPECTIVE
    // ================================================

    matrix =
      cv.getPerspectiveTransform(
        srcTri,
        dstTri
      )

    dst = new cv.Mat()

    cv.warpPerspective(
      src,
      dst,
      matrix,
      new cv.Size(
        width,
        height
      ),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(
        255,
        255,
        255,
        255
      )
    )

    // ================================================
    // CANVAS HASIL
    // ================================================

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
    if (srcTri)
      srcTri.delete()
    if (dstTri)
      dstTri.delete()
    if (matrix)
      matrix.delete()
  }
}


// =====================================================
// BACA JAWABAN SISWA
// VERSI GRID TETAP SESUAI LAYOUT LJK
//
// Tidak menggunakan HoughCircles.
//
// Posisi bubble dihitung dari layout LJK yang dibuat
// oleh AnswerSheet.jsx.
//
// Jawaban ditentukan berdasarkan tinta paling tebal
// di bagian TENGAH bubble A-E.
//
// 40-70  = 2 kolom
// 80-100 = 3 kolom
// =====================================================

// =====================================================
// BACA JAWABAN SISWA
//
// CARA KERJA:
// 1. Deteksi semua bubble dengan HoughCircles
// 2. Kelompokkan bubble berdasarkan kolom
// 3. Di setiap kolom, cari baris yang berisi 5 bubble
// 4. 5 bubble dalam satu baris = A B C D E
// 5. Hitung tinta di bagian tengah setiap bubble
// 6. Tinta paling tebal = jawaban
//
// TIDAK menggunakan koordinat A-E yang tetap.
// Jadi posisi bubble dicari dari gambar.
//
// Foto boleh miring karena sebelumnya sudah di-warp.
// =====================================================

const readStudentAnswers = (
  canvas,
  totalQuestions
) => {
  if (
    !window.cv ||
    !window.cv.Mat
  ) {
    return {
      answers: {},
      debug: "❌ OpenCV belum siap.",
    }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blur = null
  let circles = null

  try {
    // =====================================================
    // 1. BACA GAMBAR HASIL WARP
    // =====================================================

    src = cv.imread(canvas)

    gray = new cv.Mat()

    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    )

    blur = new cv.Mat()

    cv.GaussianBlur(
      gray,
      blur,
      new cv.Size(5, 5),
      0
    )

    // =====================================================
    // 2. KONFIGURASI
    // =====================================================

    const columnCount =
      totalQuestions >= 80
        ? 3
        : 2

    const questionsPerColumn =
      Math.ceil(
        totalQuestions /
          columnCount
      )

    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E",
    ]

    // =====================================================
    // 3. DETEKSI BUBBLE
    // =====================================================

    circles = new cv.Mat()

    cv.HoughCircles(
      blur,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      8,
      100,
      18,
      5,
      20
    )

    const rawCircles = []

    for (
      let i = 0;
      i < circles.cols;
      i++
    ) {
      const x =
        circles.data32F[
          i * 3
        ]

      const y =
        circles.data32F[
          i * 3 + 1
        ]

      const r =
        circles.data32F[
          i * 3 + 2
        ]

      // -----------------------------------------------
      // Area pilihan ganda
      // -----------------------------------------------

      if (
        y <
        canvas.height * 0.18
      ) {
        continue
      }

      if (
        y >
        canvas.height * 0.80
      ) {
        continue
      }

      // -----------------------------------------------
      // Radius bubble
      // -----------------------------------------------

      if (
        r < 5 ||
        r > 20
      ) {
        continue
      }

      rawCircles.push({
        x,
        y,
        r,
      })
    }

    // =====================================================
    // 4. DEDUPLIKASI BUBBLE
    // =====================================================

    /*
     * Hough sering menemukan bubble yang sama
     * beberapa kali.
     *
     * Kita gabungkan kalau pusatnya sangat dekat.
     */

    rawCircles.sort(
      (a, b) =>
        a.y - b.y
    )

    const detectedCircles = []

    for (
      const circle of rawCircles
    ) {
      let duplicate = false

      for (
        const existing of
          detectedCircles
      ) {
        const dx =
          circle.x -
          existing.x

        const dy =
          circle.y -
          existing.y

        const distance =
          Math.sqrt(
            dx * dx +
              dy * dy
          )

        const allowed =
          Math.min(
            circle.r,
            existing.r
          ) * 0.90

        if (
          distance <=
          allowed
        ) {
          duplicate = true

          /*
           * Kalau deteksi baru punya
           * radius lebih besar,
           * gunakan yang lebih besar.
           */

          if (
            circle.r >
            existing.r
          ) {
            existing.x =
              circle.x

            existing.y =
              circle.y

            existing.r =
              circle.r
          }

          break
        }
      }

      if (
        !duplicate
      ) {
        detectedCircles.push(
          {
            ...circle,
          }
        )
      }
    }

    // =====================================================
    // 5. CARI KOLOM DARI POSISI BUBBLE
    // =====================================================
    //
    // TIDAK menggunakan lebar halaman.
    //
    // Kita cari kelompok X yang memang
    // muncul pada gambar.
    //

    const xSorted =
      [...detectedCircles]
        .sort(
          (a, b) =>
            a.x - b.x
        )

    const xGaps = []

    for (
      let i = 1;
      i < xSorted.length;
      i++
    ) {
      const gap =
        xSorted[i].x -
        xSorted[i - 1].x

      if (
        gap > 15
      ) {
        xGaps.push({
          gap,
          index: i,
        })
      }
    }

    /*
     * Cari gap X terbesar.
     *
     * Gap besar biasanya berada
     * di antara kolom.
     */

    xGaps.sort(
      (a, b) =>
        b.gap - a.gap
    )

    const columnBreaks =
      xGaps
        .slice(
          0,
          columnCount - 1
        )
        .sort(
          (a, b) =>
            a.index - b.index
        )

    const columnCircles =
      Array.from(
        {
          length:
            columnCount,
        },
        () => []
      )

    for (
      const circle of
        detectedCircles
    ) {
      let columnIndex = 0

      for (
        const breakPoint of
          columnBreaks
      ) {
        const breakCircle =
          xSorted[
            breakPoint.index
          ]

        if (
          circle.x >
          breakCircle.x
        ) {
          columnIndex++
        }
      }

      if (
        columnIndex >=
        columnCount
      ) {
        columnIndex =
          columnCount - 1
      }

      columnCircles[
        columnIndex
      ].push(circle)
    }

    // =====================================================
    // 6. HITUNG TINTA
    // =====================================================

    const calculateInk = (circle) => {
      /*
      * Kita hanya membaca BAGIAN TENGAH bubble.
      *
      * Garis lingkaran berada di luar,
      * jadi tidak boleh dianggap sebagai tinta.
      */

      const cx = circle.x
      const cy = circle.y
      const r = circle.r

      // Beberapa ukuran lingkaran bagian tengah
      const radii = [
        r * 0.22,
        r * 0.28,
        r * 0.34,
      ]

      const thresholds = [
        100,
        120,
        140,
        160,
        180,
      ]

      const scores = []

      for (
        const radius of radii
      ) {
        for (
          const threshold of thresholds
        ) {
          let dark = 0
          let total = 0

          const minX =
            Math.floor(
              cx - radius
            )

          const maxX =
            Math.ceil(
              cx + radius
            )

          const minY =
            Math.floor(
              cy - radius
            )

          const maxY =
            Math.ceil(
              cy + radius
            )

          for (
            let y = minY;
            y <= maxY;
            y++
          ) {
            if (
              y < 0 ||
              y >= gray.rows
            ) {
              continue
            }

            for (
              let x = minX;
              x <= maxX;
              x++
            ) {
              if (
                x < 0 ||
                x >= gray.cols
              ) {
                continue
              }

              const dx =
                x - cx

              const dy =
                y - cy

              if (
                dx * dx +
                  dy * dy >
                radius * radius
              ) {
                continue
              }

              const value =
                gray.ucharPtr(
                  y,
                  x
                )[0]

              if (
                value <
                threshold
              ) {
                dark++
              }

              total++
            }
          }

          if (
            total > 0
          ) {
            scores.push(
              dark / total
            )
          }
        }
      }

      if (
        scores.length === 0
      ) {
        return 0
      }

      /*
      * Urutkan hasil.
      *
      * Kita tidak mengambil nilai terbesar,
      * karena noise kamera bisa membuat satu
      * threshold melonjak.
      *
      * Ambil nilai tengah (median).
      */

      scores.sort(
        (a, b) =>
          a - b
      )

      const middle =
        Math.floor(
          scores.length / 2
        )

      if (
        scores.length % 2 === 0
      ) {
        return (
          (
            scores[
              middle - 1
            ] +
            scores[middle]
          ) / 2
        )
      }

      return scores[middle]
    }

    // =====================================================
    // 7. CARI BARIS DALAM SETIAP KOLOM
    // =====================================================

    const getRows =
      (
        circlesInColumn
      ) => {
        const sorted =
          [...circlesInColumn]
            .sort(
              (a, b) =>
                a.y - b.y
            )

        if (
          sorted.length === 0
        ) {
          return []
        }

        // -----------------------------------------------
        // Cari jarak Y yang umum
        // -----------------------------------------------

        const gaps = []

        for (
          let i = 1;
          i < sorted.length;
          i++
        ) {
          const gap =
            sorted[i].y -
            sorted[i - 1].y

          if (
            gap > 8 &&
            gap <
              canvas.height *
                0.04
          ) {
            gaps.push(gap)
          }
        }

        gaps.sort(
          (a, b) =>
            a - b
        )

        const medianGap =
          gaps.length
            ? gaps[
                Math.floor(
                  gaps.length /
                    2
                )
              ]
            : 25

        /*
         * Toleransi cukup besar.
         *
         * Ini membuat LJK yang sedikit
         * miring tetap bisa masuk
         * ke baris yang sama.
         */

        const tolerance =
          Math.max(
            8,
            Math.min(
              medianGap *
                0.55,
              15
            )
          )

        const rows = []

        for (
          const circle of
            sorted
        ) {
          let nearest =
            null

          let nearestDistance =
            Infinity

          for (
            const row of rows
          ) {
            const distance =
              Math.abs(
                circle.y -
                  row.centerY
              )

            if (
              distance <
              nearestDistance
            ) {
              nearestDistance =
                distance

              nearest =
                row
            }
          }

          if (
            nearest &&
            nearestDistance <=
              tolerance
          ) {
            nearest.circles.push(
              circle
            )

            nearest.centerY =
              nearest.circles.reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  item.y,
                0
              ) /
              nearest.circles
                .length
          } else {
            rows.push({
              centerY:
                circle.y,

              circles: [
                circle,
              ],
            })
          }
        }

        return rows
          .filter(
            row =>
              row.circles
                .length >= 3
          )
          .sort(
            (a, b) =>
              a.centerY -
              b.centerY
          )
      }

    // =====================================================
    // 8. PROSES SEMUA KOLOM
    // =====================================================

    console.log(
      `🔍 SOAL ${questionNumber}`,
      {
        tintaA:
          Number(
            inkValues[0].toFixed(3)
          ),

        tintaB:
          Number(
            inkValues[1].toFixed(3)
          ),

        tintaC:
          Number(
            inkValues[2].toFixed(3)
          ),

        tintaD:
          Number(
            inkValues[3].toFixed(3)
          ),

        tintaE:
          Number(
            inkValues[4].toFixed(3)
          ),

        jawaban:
          choices[highestIndex],
      }
    )

    const answers = {}

    let questionNumber = 1
    let answeredCount = 0
    let doubleCount = 0

    const rowCounts = []

    for (
      let columnIndex = 0;
      columnIndex <
      columnCount;
      columnIndex++
    ) {
      const rows =
        getRows(
          columnCircles[
            columnIndex
          ]
        )

      const expectedRows =
        Math.min(
          questionsPerColumn,
          totalQuestions -
            columnIndex *
              questionsPerColumn
        )

      let finalRows =
        rows

      /*
       * Kalau lebih banyak dari jumlah
       * soal, pilih baris yang paling
       * lengkap.
       */

      if (
        rows.length >
        expectedRows
      ) {
        finalRows =
          [...rows]
            .sort(
              (a, b) =>
                b.circles
                  .length -
                a.circles
                  .length
            )
            .slice(
              0,
              expectedRows
            )
            .sort(
              (a, b) =>
                a.centerY -
                b.centerY
            )
      }

      rowCounts.push(
        finalRows.length
      )

      // ===================================================
      // 9. BACA SATU PER SATU BARIS
      // ===================================================

      for (
        let rowIndex = 0;
        rowIndex <
          finalRows.length;
        rowIndex++
      ) {
        if (
          questionNumber >
          totalQuestions
        ) {
          break
        }

        const row =
          finalRows[
            rowIndex
          ]

        /*
         * =================================================
         * URUTKAN BUBBLE DARI KIRI KE KANAN
         * =================================================
         *
         * INI PENTING.
         *
         * Tidak ada:
         *
         * A = x sekian
         * B = x sekian
         *
         * Kita langsung mengambil
         * bubble yang ditemukan
         * pada baris ini.
         */

        const bubbles =
          [...row.circles]
            .sort(
              (a, b) =>
                a.x - b.x
            )

        // =================================================
        // 10. HILANGKAN DUPLIKAT DALAM BARIS
        // =================================================

        const uniqueBubbles =
          []

        for (
          const bubble of
            bubbles
        ) {
          const duplicate =
            uniqueBubbles.some(
              existing =>
                Math.abs(
                  bubble.x -
                    existing.x
                ) <
                Math.max(
                  bubble.r,
                  existing.r
                ) *
                  1.15
            )

          if (
            !duplicate
          ) {
            uniqueBubbles.push(
              bubble
            )
          }
        }

        /*
         * Kita hanya butuh 5 bubble
         * dalam satu baris.
         */

        let answerBubbles =
          uniqueBubbles

        if (
          answerBubbles.length > 5
        ) {
          /*
          * Cari kelompok 5 bubble yang
          * jaraknya paling konsisten.
          */

          let bestGroup = null
          let bestScore =
            Infinity

          for (
            let i = 0;
            i <=
              answerBubbles.length - 5;
            i++
          ) {
            const group =
              answerBubbles.slice(
                i,
                i + 5
              )

            const gaps = []

            for (
              let j = 1;
              j < group.length;
              j++
            ) {
              gaps.push(
                group[j].x -
                  group[j - 1].x
              )
            }

            const averageGap =
              gaps.reduce(
                (sum, value) =>
                  sum + value,
                0
              ) /
              gaps.length

            const variance =
              gaps.reduce(
                (sum, value) =>
                  sum +
                  Math.pow(
                    value -
                      averageGap,
                    2
                  ),
                0
              ) /
              gaps.length

            /*
            * Semakin kecil variance,
            * semakin rapi susunan bubble.
            */

            if (
              variance <
              bestScore
            ) {
              bestScore =
                variance

              bestGroup =
                group
            }
          }

          if (
            bestGroup
          ) {
            answerBubbles =
              bestGroup
          }
        }

        // =================================================
        // 11. HITUNG TINTA
        // =================================================

        const inkValues =
          answerBubbles
            .slice(
              0,
              5
            )
            .map(
              bubble =>
                calculateInk(
                  bubble
                )
            )

        /*
         * Kalau bubble kurang dari 5,
         * isi sisanya dengan 0.
         */

        while (
          inkValues.length <
          5
        ) {
          inkValues.push(0)
        }

        // =================================================
        // 12. CARI TINTA TERBESAR
        // =================================================

        let highestIndex = 0

        for (
          let i = 1;
          i <
          inkValues.length;
          i++
        ) {
          if (
            inkValues[i] >
            inkValues[
              highestIndex
            ]
          ) {
            highestIndex =
              i
          }
        }

        const sortedInk =
          [...inkValues].sort(
            (a, b) =>
              b - a
          )

        const highest =
          sortedInk[0] ||
          0

        const second =
          sortedInk[1] ||
          0

        /*
         * Jangan jadikan kosong.
         *
         * Karena kamu sudah memastikan
         * semua soal diisi A.
         */

        const answer =
          choices[
            highestIndex
          ]

        answers[
          questionNumber
        ] = answer

        answeredCount++

        /*
         * Informasi ganda saja.
         * Tidak mengubah jawaban.
         */

        if (
          highest > 0 &&
          second >=
            highest *
              0.90
        ) {
          doubleCount++
        }

        // =================================================
        // DEBUG
        // =================================================

        console.log(
          `SOAL ${questionNumber}`,
          {
            kolom:
              columnIndex + 1,

            baris:
              rowIndex + 1,

            bubble:
              answerBubbles.map(
                bubble => ({
                  x:
                    Math.round(
                      bubble.x
                    ),
                  y:
                    Math.round(
                      bubble.y
                    ),
                })
              ),

            tinta:
              inkValues.map(
                value =>
                  Number(
                    value.toFixed(
                      3
                    )
                  )
              ),

            jawaban:
              answer,
          }
        )

        questionNumber++
      }
    }

    // =====================================================
    // 13. DEBUG HASIL
    // =====================================================

    return {
      answers,

      debug:
        `🔎 Bubble: ${detectedCircles.length} | ` +
        `Kolom: ${columnCount} | ` +
        `Baris: ${rowCounts.join("/")}` +
        ` | Baca: ${answeredCount}/${totalQuestions}` +
        ` | Ganda: ${doubleCount}`,
    }

  } catch (
    error
  ) {
    console.error(
      "ERROR READ ANSWERS:",
      error
    )

    return {
      answers: {},

      debug:
        "❌ Gagal membaca jawaban: " +
        error.message,
    }

  } finally {
    if (circles)
      circles.delete()

    if (src)
      src.delete()

    if (gray)
      gray.delete()

    if (blur)
      blur.delete()
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
        scanResult?.debug || "Gagal Membaca Lembar Jawaban"
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
                    Pastikan seluruh LJK berada di dalam kotak
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