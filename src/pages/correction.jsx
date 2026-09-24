import { useEffect, useRef, useState } from "react"
import { supabase } from "../services/supabase"

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

    return () => {
      stopCameraTracks()
    }
  }, [])

  useEffect(() => {
    if (
      cameraOpen &&
      videoRef.current &&
      streamRef.current
    ) {
      videoRef.current.srcObject =
        streamRef.current
    }
  }, [cameraOpen])

  // =====================================================
  // AMBIL DATA UJIAN
  // =====================================================

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("created_at", {
        ascending: false,
      })

    if (error) {
      console.error(
        "Error mengambil ujian:",
        error
      )
      return
    }

    setExams(data || [])
  }

  // =====================================================
  // AMBIL KUNCI JAWABAN
  // =====================================================

  const getAnswerKey = async () => {
    const { data, error } = await supabase
      .from("answer_keys")
      .select("*")
      .eq("question_id", selectedExam)
      .order("question_number", {
        ascending: true,
      })

    if (error) {
      console.error(
        "Error mengambil kunci jawaban:",
        error
      )

      return []
    }

    const uniqueMap = new Map()

    ;(data || []).forEach((row) => {
      uniqueMap.set(
        row.question_number,
        row
      )
    })

    return Array.from(
      uniqueMap.values()
    ).sort(
      (a, b) =>
        Number(a.question_number) -
        Number(b.question_number)
    )
  }

  // =====================================================
  // HITUNG HASIL
  // =====================================================

  const calculateResult = (
    studentAnswers,
    answerKeys
  ) => {
    let correct = 0
    let wrong = 0
    let empty = 0

    const details = []

    answerKeys.forEach((key) => {
      const studentAnswer = String(
        studentAnswers[
          key.question_number
        ] || ""
      )
        .trim()
        .toUpperCase()

      const correctAnswer = String(
        key.answer || ""
      )
        .trim()
        .toUpperCase()

      let status = ""

      if (!studentAnswer) {
        empty++
        status = "empty"
      } else if (
        studentAnswer === correctAnswer
      ) {
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
        ? Math.round(
            (correct / total) * 100
          )
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

  // =====================================================
  // KAMERA
  // =====================================================

  const startCamera = async () => {
    try {
      setMessage("")

      if (!selectedExam) {
        setMessage(
          "Silakan pilih ujian terlebih dahulu."
        )
        return
      }

      if (!studentName.trim()) {
        setMessage(
          "Silakan masukkan nama siswa terlebih dahulu."
        )
        return
      }

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
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
          }
        )

      streamRef.current = stream

      setCameraOpen(true)
    } catch (error) {
      console.error(
        "Kamera error:",
        error
      )

      setMessage(
        "Kamera tidak dapat digunakan. Pastikan izin kamera sudah diberikan."
      )
    }
  }

  const stopCameraTracks = () => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop()
        })

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
  // HELPER JARAK
  // =====================================================

  const distance = (a, b) => {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
        Math.pow(a.y - b.y, 2)
    )
  }

  // =====================================================
  // URUTKAN 4 MARKER
  // =====================================================

  const orderMarkers = (points) => {
    if (!points || points.length !== 4) {
      return null
    }

    const sortedBySum = [...points].sort(
      (a, b) =>
        a.x +
        a.y -
        (b.x + b.y)
    )

    const topLeft =
      sortedBySum[0]

    const bottomRight =
      sortedBySum[3]

    const remaining =
      sortedBySum.slice(1, 3)

    let topRight
    let bottomLeft

    if (
      remaining[0].y <
      remaining[1].y
    ) {
      topRight = remaining[0]
      bottomLeft = remaining[1]
    } else {
      topRight = remaining[1]
      bottomLeft = remaining[0]
    }

    return {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
    }
  }

  // =====================================================
  // DETEKSI 4 MARKER HITAM
  //
  // LJK AnswerSheet:
  // marker = 8mm x 8mm
  // posisi = 7mm dari tepi
  // =====================================================


  // =====================================================
  // DETEKSI KERTAS LJK
  //
  // PENTING:
  // LJK INI TIDAK MENGGUNAKAN 4 MARKER HITAM.
  // Jadi jangan mencari marker.
  //
  // Kita mencari garis luar kertas menggunakan Canny
  // lalu mengambil quadrilateral terbesar.
  // =====================================================

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
    let blur = null
    let edges = null
    let contours = null
    let hierarchy = null

    try {
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

      edges = new cv.Mat()

      cv.Canny(
        blur,
        edges,
        40,
        120
      )

      contours =
        new cv.MatVector()

      hierarchy =
        new cv.Mat()

      cv.findContours(
        edges,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      )

      const imageArea =
        src.cols * src.rows

      const candidates = []

      for (
        let i = 0;
        i < contours.size();
        i++
      ) {
        const contour =
          contours.get(i)

        try {
          const area =
            cv.contourArea(
              contour
            )

          if (
            area <
            imageArea * 0.15
          ) {
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
            0.03 * perimeter,
            true
          )

          if (
            approx.rows !== 4
          ) {
            approx.delete()
            continue
          }

          const points = []

          for (
            let j = 0;
            j < 4;
            j++
          ) {
            points.push({
              x: approx.intAt(
                j,
                0
              ),
              y: approx.intAt(
                j,
                1
              ),
            })
          }

          approx.delete()

          const ordered =
            orderMarkers(
              points
            )

          if (!ordered) {
            continue
          }

          const widthTop =
            Math.hypot(
              ordered.topRight.x -
                ordered.topLeft.x,
              ordered.topRight.y -
                ordered.topLeft.y
            )

          const widthBottom =
            Math.hypot(
              ordered.bottomRight.x -
                ordered.bottomLeft.x,
              ordered.bottomRight.y -
                ordered.bottomLeft.y
            )

          const heightLeft =
            Math.hypot(
              ordered.bottomLeft.x -
                ordered.topLeft.x,
              ordered.bottomLeft.y -
                ordered.topLeft.y
            )

          const heightRight =
            Math.hypot(
              ordered.bottomRight.x -
                ordered.topRight.x,
              ordered.bottomRight.y -
                ordered.topRight.y
            )

          const avgWidth =
            (
              widthTop +
              widthBottom
            ) / 2

          const avgHeight =
            (
              heightLeft +
              heightRight
            ) / 2

          if (
            avgWidth <= 0 ||
            avgHeight <= 0
          ) {
            continue
          }

          const ratio =
            avgWidth /
            avgHeight

          // F4 portrait sekitar 0.636.
          // Toleransi cukup lebar untuk kamera miring.
          if (
            ratio < 0.45 ||
            ratio > 0.90
          ) {
            continue
          }

          candidates.push({
            ordered,
            area,
            ratio,
          })
        } finally {
          contour.delete()
        }
      }

      if (
        candidates.length === 0
      ) {
        return {
          detected: false,
          message:
            "❌ Kertas LJK belum terdeteksi. Pastikan seluruh kertas terlihat.",
        }
      }

      candidates.sort(
        (a, b) =>
          b.area - a.area
      )

      const best =
        candidates[0]

      console.log(
        "===== KERTAS LJK TERDETEKSI ====="
      )

      console.log(
        "Top Left:",
        best.ordered.topLeft
      )

      console.log(
        "Top Right:",
        best.ordered.topRight
      )

      console.log(
        "Bottom Left:",
        best.ordered.bottomLeft
      )

      console.log(
        "Bottom Right:",
        best.ordered.bottomRight
      )

      console.log(
        "Area:",
        best.area
      )

      console.log(
        "Ratio:",
        best.ratio
      )

      return {
        detected: true,
        message:
          "✅ LJK berhasil ditemukan.",
        markers:
          best.ordered,
      }
    } catch (error) {
      console.error(
        "ERROR DETEKSI KERTAS:",
        error
      )

      return {
        detected: false,
        message:
          `❌ Gagal mendeteksi LJK: ${
            error?.message ||
            "error tidak diketahui"
          }`,
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (blur) blur.delete()
      if (edges) edges.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  }

  // =====================================================
  // WARP / LURUSKAN LJK
  //
  // Hasil selalu 840 x 1320.
  // Ini adalah rasio 210 x 330 mm.
  //
  // Setelah warp, pinggir luar diberi putih supaya
  // background meja tidak ikut tampil sebagai preview.
  // =====================================================

  const warpAnswerSheet = (canvas, markers) => {
    if (!window.cv || !window.cv.Mat) {
      return null
    }

    const cv = window.cv

    let src = null
    let dst = null
    let srcTri = null
    let dstTri = null
    let matrix = null

    try {
      src = cv.imread(canvas)

      const outputWidth = 840
      const outputHeight = 1320

      srcTri =
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          [
            markers.topLeft.x,
            markers.topLeft.y,

            markers.topRight.x,
            markers.topRight.y,

            markers.bottomRight.x,
            markers.bottomRight.y,

            markers.bottomLeft.x,
            markers.bottomLeft.y,
          ]
        )

      dstTri =
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          [
            0,
            0,

            outputWidth,
            0,

            outputWidth,
            outputHeight,

            0,
            outputHeight,
          ]
        )

      matrix =
        cv.getPerspectiveTransform(
          srcTri,
          dstTri
        )

      dst =
        new cv.Mat()

      cv.warpPerspective(
        src,
        dst,
        matrix,
        new cv.Size(
          outputWidth,
          outputHeight
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

      // =================================================
      // BUAT BORDER LUAR PUTIH
      //
      // Hanya menghilangkan sedikit background yang
      // kadang masuk di tepi hasil perspective.
      // Tidak menyentuh area soal.
      // =================================================

      const border = 12

      cv.rectangle(
        dst,
        new cv.Point(
          0,
          0
        ),
        new cv.Point(
          outputWidth - 1,
          border
        ),
        new cv.Scalar(
          255,
          255,
          255,
          255
        ),
        -1
      )

      cv.rectangle(
        dst,
        new cv.Point(
          0,
          outputHeight -
            border
        ),
        new cv.Point(
          outputWidth - 1,
          outputHeight - 1
        ),
        new cv.Scalar(
          255,
          255,
          255,
          255
        ),
        -1
      )

      cv.rectangle(
        dst,
        new cv.Point(
          0,
          0
        ),
        new cv.Point(
          border,
          outputHeight - 1
        ),
        new cv.Scalar(
          255,
          255,
          255,
          255
        ),
        -1
      )

      cv.rectangle(
        dst,
        new cv.Point(
          outputWidth -
            border,
          0
        ),
        new cv.Point(
          outputWidth - 1,
          outputHeight - 1
        ),
        new cv.Scalar(
          255,
          255,
          255,
          255
        ),
        -1
      )

      const resultCanvas =
        document.createElement(
          "canvas"
        )

      resultCanvas.width =
        outputWidth

      resultCanvas.height =
        outputHeight

      cv.imshow(
        resultCanvas,
        dst
      )

      return resultCanvas
    } catch (error) {
      console.error(
        "ERROR WARP LJK:",
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

  const getSheetLayout = (totalQuestions) => {
    const columnCount = totalQuestions >= 80 ? 3 : 2

    const questionsPerColumn = Math.ceil(
      totalQuestions / columnCount
    )

    const rowHeightMm =
      totalQuestions >= 80
        ? 4.8
        : totalQuestions >= 60
        ? 5
        : 5.5

    const bubbleSizeMm =
      totalQuestions >= 100
        ? 4
        : totalQuestions >= 90
        ? 4.2
        : totalQuestions >= 80
        ? 4.3
        : totalQuestions >= 70
        ? 4.5
        : 5

    return {
      columnCount,
      questionsPerColumn,
      rowHeightMm,
      bubbleSizeMm,
    }
  }

  // =====================================================
  // K-MEANS 1 DIMENSI
  // Dipakai hanya untuk mengkalibrasi posisi bubble yang
  // sudah tercetak pada LJK. Tidak dipakai untuk menentukan
  // jawaban secara langsung.
  // =====================================================

  const cluster1D = (values, k) => {
    if (!values || values.length < k) {
      return []
    }

    const sorted = [...values]
      .filter(Number.isFinite)
      .sort((a, b) => a - b)

    if (sorted.length < k) {
      return []
    }

    // Ambil centroid awal yang merata dari data.
    let centers = []

    for (let i = 0; i < k; i++) {
      const index = Math.round(
        (i * (sorted.length - 1)) /
          (k - 1 || 1)
      )

      centers.push(sorted[index])
    }

    for (let iteration = 0; iteration < 30; iteration++) {
      const groups = Array.from(
        { length: k },
        () => []
      )

      for (const value of sorted) {
        let nearest = 0
        let nearestDistance = Infinity

        for (let i = 0; i < centers.length; i++) {
          const d = Math.abs(value - centers[i])

          if (d < nearestDistance) {
            nearestDistance = d
            nearest = i
          }
        }

        groups[nearest].push(value)
      }

      const nextCenters = groups.map((group, index) => {
        if (!group.length) {
          return centers[index]
        }

        return (
          group.reduce((sum, value) => sum + value, 0) /
          group.length
        )
      })

      const difference = nextCenters.reduce(
        (sum, value, index) =>
          sum + Math.abs(value - centers[index]),
        0
      )

      centers = nextCenters

      if (difference < 0.01) {
        break
      }
    }

    return centers.sort((a, b) => a - b)
  }

  // =====================================================
  // DETEKSI CIRCLE BUBBLE
  // =====================================================

  const detectBubbleCircles = (gray) => {
    const cv = window.cv

    const all = []
    const settings = [
      { param2: 9, minDist: 8 },
      { param2: 8, minDist: 7 },
      { param2: 7, minDist: 6 },
    ]

    for (const setting of settings) {
      const circles = new cv.Mat()

      try {
        cv.HoughCircles(
          gray,
          circles,
          cv.HOUGH_GRADIENT,
          1,
          setting.minDist,
          90,
          setting.param2,
          4,
          11
        )

        for (let i = 0; i < circles.cols; i++) {
          const x = circles.data32F[i * 3]
          const y = circles.data32F[i * 3 + 1]
          const r = circles.data32F[i * 3 + 2]

          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            continue
          }

          // Area jawaban pada LJK 100 soal.
          if (y < 280 || y > 930) {
            continue
          }

          if (r < 4 || r > 11) {
            continue
          }

          all.push({ x, y, r })
        }
      } finally {
        circles.delete()
      }
    }

    // Hilangkan duplikasi Hough yang terlalu dekat.
    all.sort((a, b) => b.r - a.r)

    const unique = []

    for (const circle of all) {
      const duplicate = unique.some(
        (item) =>
          Math.hypot(
            item.x - circle.x,
            item.y - circle.y
          ) < 5
      )

      if (!duplicate) {
        unique.push(circle)
      }
    }

    return unique
  }

  // =====================================================
  // BACA TINTA DI TENGAH BUBBLE
  // =====================================================

  const measureBubbleInk = (
    gray,
    centerX,
    centerY,
    radius
  ) => {
    const innerRadius = Math.max(
      3,
      radius * 0.55
    )

    const startX = Math.floor(centerX - innerRadius)
    const endX = Math.ceil(centerX + innerRadius)
    const startY = Math.floor(centerY - innerRadius)
    const endY = Math.ceil(centerY + innerRadius)

    let dark = 0
    let total = 0

    for (let y = startY; y <= endY; y++) {
      if (y < 0 || y >= gray.rows) continue

      for (let x = startX; x <= endX; x++) {
        if (x < 0 || x >= gray.cols) continue

        const dx = x - centerX
        const dy = y - centerY

        if (
          dx * dx + dy * dy >
          innerRadius * innerRadius
        ) {
          continue
        }

        const value = gray.ucharPtr(y, x)[0]

        if (value < 155) {
          dark++
        }

        total++
      }
    }

    return total ? dark / total : 0
  }

  // =====================================================
  // BACA JAWABAN
  //
  // Versi ini TIDAK lagi mengandalkan posisi mm yang ditebak.
  // Posisi bubble dikalibrasi langsung dari bubble yang tercetak
  // pada foto LJK setelah perspective warp.
  // =====================================================


  // =====================================================
  // BACA JAWABAN OMR
  //
  // LJK ini adalah layout TETAP yang dibuat oleh
  // AnswerSheet.jsx.
  //
  // Setelah perspective warp:
  // 840 x 1320 px
  //
  // Karena layout-nya tetap, JANGAN gunakan Hough Circle
  // untuk menentukan nomor/baris.
  //
  // Posisi bubble sudah diketahui dari LJK asli.
  // =====================================================

  const readStudentAnswers = (
    canvas,
    totalQuestions
  ) => {
    if (!window.cv || !window.cv.Mat) {
      return {
        answers: {},
        debug: "❌ OpenCV belum siap.",
      }
    }

    const supportedTotals = [
      45,
      50,
      60,
      70,
      80,
      90,
      100,
    ]

    if (!supportedTotals.includes(Number(totalQuestions))) {
      return {
        answers: {},
        debug:
          `❌ Jumlah soal ${totalQuestions} belum didukung.`,
      }
    }

    const cv = window.cv

    let source = null
    let gray = null
    let blur = null

    try {
      source = cv.imread(canvas)

      gray = new cv.Mat()

      cv.cvtColor(
        source,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      blur = new cv.Mat()

      cv.GaussianBlur(
        gray,
        blur,
        new cv.Size(3, 3),
        0
      )

      /*
       * ===================================================
       * PENTING
       *
       * Kita TIDAK lagi memakai koordinat bubble manual
       * seperti firstYBase = 361 / rowStep = 17.3.
       *
       * Masalah sebelumnya:
       * 50 soal mempunyai jarak baris berbeda dengan 100 soal.
       * Kalau rowStep salah, semakin ke bawah semakin meleset.
       *
       * Sekarang:
       * 1. Cari lingkaran bubble yang BENAR-BENAR tercetak.
       * 2. Kelompokkan menjadi 5 pilihan per kolom.
       * 3. Kelompokkan Y menjadi baris.
       * 4. Baru baca tinta di pusat bubble.
       *
       * Jadi 45, 50, 60, 70, 80, 90, 100 dapat
       * mengikuti ukuran cetak sebenarnya.
       * ===================================================
       */

      const columnCount =
        totalQuestions >= 80
          ? 3
          : 2

      const questionsPerColumn =
        Math.ceil(
          totalQuestions /
            columnCount
        )

      const expectedBubbleCount =
        totalQuestions * 5

      // ===================================================
      // 1. CARI CIRCLE BUBBLE
      // ===================================================

      const rawCircles = []

      const houghSettings = [
        {
          param2: 9,
          minDist: 7,
        },
        {
          param2: 8,
          minDist: 6,
        },
        {
          param2: 7,
          minDist: 6,
        },
      ]

      for (
        const setting of
          houghSettings
      ) {
        const circles =
          new cv.Mat()

        try {
          cv.HoughCircles(
            blur,
            circles,
            cv.HOUGH_GRADIENT,
            1,
            setting.minDist,
            80,
            setting.param2,
            3,
            11
          )

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

            const radius =
              circles.data32F[
                i * 3 + 2
              ]

            if (
              !Number.isFinite(x) ||
              !Number.isFinite(y) ||
              !Number.isFinite(radius)
            ) {
              continue
            }

            /*
             * Area pilihan ganda.
             *
             * Hasil warp = 840 x 1320.
             * Bubble berada kira-kira dari Y 330
             * sampai sekitar 1050 tergantung jumlah soal.
             *
             * Jangan pakai batas 930 seperti versi lama,
             * karena 70 soal dapat turun lebih bawah.
             */
            if (
              x < 50 ||
              x > source.cols - 50 ||
              y < 320 ||
              y > 1100
            ) {
              continue
            }

            if (
              radius < 3 ||
              radius > 11
            ) {
              continue
            }

            rawCircles.push({
              x,
              y,
              radius,
            })
          }
        } finally {
          circles.delete()
        }
      }

      // ===================================================
      // 2. HILANGKAN CIRCLE DUPLIKAT
      // ===================================================

      rawCircles.sort(
        (a, b) =>
          b.radius - a.radius
      )

      const circles = []

      for (
        const circle of
          rawCircles
      ) {
        const duplicate =
          circles.some(
            (item) =>
              Math.hypot(
                item.x -
                  circle.x,
                item.y -
                  circle.y
              ) < 5
          )

        if (!duplicate) {
          circles.push(circle)
        }
      }

      if (
        circles.length <
        Math.max(
          50,
          expectedBubbleCount *
            0.20
        )
      ) {
        return {
          answers: {},
          debug:
            `❌ Circle bubble terlalu sedikit (${circles.length}).`,
        }
      }

      // ===================================================
      // 3. CARI POSISI X SEMUA BUBBLE
      // ===================================================

      /*
       * Setiap kolom selalu mempunyai 5 bubble:
       * A B C D E
       *
       * 2 kolom  -> 10 posisi X
       * 3 kolom  -> 15 posisi X
       */

      const xValues =
        circles.map(
          (circle) =>
            circle.x
        )

      const xCenters =
        cluster1D(
          xValues,
          columnCount * 5
        )

      if (
        xCenters.length !==
        columnCount * 5
      ) {
        return {
          answers: {},
          debug:
            "❌ Gagal mengkalibrasi posisi A-E.",
        }
      }

      /*
       * Pisahkan menjadi:
       *
       * [A B C D E] [A B C D E]
       * atau
       * [A B C D E] [A B C D E] [A B C D E]
       */

      const columnXCenters = []

      for (
        let columnIndex = 0;
        columnIndex <
        columnCount;
        columnIndex++
      ) {
        const start =
          columnIndex * 5

        const group =
          xCenters.slice(
            start,
            start + 5
          )

        /*
         * Harus semakin ke kanan.
         */
        group.sort(
          (a, b) => a - b
        )

        columnXCenters.push(
          group
        )
      }

      // ===================================================
      // 4. CARI POSISI Y SETIAP BARIS
      // ===================================================

      /*
       * Jangan memakai satu rowStep untuk semua jenis LJK.
       *
       * 45/50 dapat mempunyai jarak berbeda dengan 60/70.
       * 80/90/100 juga berbeda.
       *
       * Kita ambil Y langsung dari bubble yang terdeteksi.
       */

      const rowYCenters = []

      for (
        let columnIndex = 0;
        columnIndex <
        columnCount;
        columnIndex++
      ) {
        const xGroup =
          columnXCenters[
            columnIndex
          ]

        const minX =
          xGroup[0] - 9

        const maxX =
          xGroup[4] + 9

        const yValues =
          circles
            .filter(
              (circle) =>
                circle.x >=
                  minX &&
                circle.x <=
                  maxX
            )
            .map(
              (circle) =>
                circle.y
            )

        if (
          yValues.length <
          questionsPerColumn
        ) {
          return {
            answers: {},
            debug:
              `❌ Baris kolom ${columnIndex + 1} tidak terbaca.`,
          }
        }

        const centers =
          cluster1D(
            yValues,
            questionsPerColumn
          )

        if (
          centers.length !==
          questionsPerColumn
        ) {
          return {
            answers: {},
            debug:
              `❌ Gagal mengkalibrasi baris kolom ${columnIndex + 1}.`,
          }
        }

        rowYCenters.push(
          centers.sort(
            (a, b) => a - b
          )
        )
      }

      // ===================================================
      // 5. BACA TINTA
      // ===================================================

      const choices = [
        "A",
        "B",
        "C",
        "D",
        "E",
      ]

      const answers = {}

      let answeredCount = 0
      let emptyCount = 0
      let doubleCount = 0

      const debugData = []

      /*
       * Ukuran area baca dibuat relatif terhadap
       * jarak antar bubble.
       *
       * Ini lebih aman daripada radius 5.2px tetap.
       */

      const averageXGap =
        columnXCenters
          .flatMap(
            (group) =>
              group
                .slice(1)
                .map(
                  (x, index) =>
                    x -
                    group[index]
                )
          )
          .reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
        (
          columnCount *
            4
        )

      const inkRadius =
        Math.max(
          4,
          Math.min(
            6,
            averageXGap *
              0.22
          )
        )

      const measureInk =
        (
          centerX,
          centerY
        ) => {
          const radius =
            inkRadius

          const radiusSquared =
            radius * radius

          const startX =
            Math.floor(
              centerX -
                radius
            )

          const endX =
            Math.ceil(
              centerX +
                radius
            )

          const startY =
            Math.floor(
              centerY -
                radius
            )

          const endY =
            Math.ceil(
              centerY +
                radius
            )

          let dark = 0
          let total = 0

          for (
            let y = startY;
            y <= endY;
            y++
          ) {
            if (
              y < 0 ||
              y >= gray.rows
            ) {
              continue
            }

            for (
              let x = startX;
              x <= endX;
              x++
            ) {
              if (
                x < 0 ||
                x >= gray.cols
              ) {
                continue
              }

              const dx =
                x - centerX

              const dy =
                y - centerY

              if (
                dx * dx +
                  dy * dy >
                radiusSquared
              ) {
                continue
              }

              const value =
                gray.ucharPtr(
                  y,
                  x
                )[0]

              total++

              /*
               * Hanya tinta bagian tengah.
               * Garis lingkaran berada lebih luar.
               */
              if (
                value < 155
              ) {
                dark++
              }
            }
          }

          return total
            ? dark / total
            : 0
        }

      // ===================================================
      // 6. BACA SETIAP SOAL
      // ===================================================

      for (
        let questionIndex = 0;
        questionIndex <
        totalQuestions;
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

        const xGroup =
          columnXCenters[
            columnIndex
          ]

        const y =
          rowYCenters[
            columnIndex
          ][rowIndex]

        const values = []

        for (
          let choiceIndex = 0;
          choiceIndex < 5;
          choiceIndex++
        ) {
          const x =
            xGroup[
              choiceIndex
            ]

          values.push(
            measureInk(
              x,
              y
            )
          )
        }

        const ranked =
          values
            .map(
              (
                value,
                index
              ) => ({
                value,
                index,
              })
            )
            .sort(
              (a, b) =>
                b.value -
                a.value
            )

        const highest =
          ranked[0]?.value || 0

        const second =
          ranked[1]?.value || 0

        /*
         * Karena pusat bubble kosong hampir putih,
         * sedangkan bubble hitam memiliki tinta kuat.
         */
        const EMPTY_THRESHOLD =
          0.30

        /*
         * Ganda hanya jika dua bubble memang
         * sama-sama gelap.
         */
        const DOUBLE_THRESHOLD =
          0.55

        if (
          highest <
          EMPTY_THRESHOLD
        ) {
          answers[
            questionNumber
          ] = ""

          emptyCount++

          debugData.push({
            number:
              questionNumber,
            values,
            answer:
              "KOSONG",
          })

          continue
        }

        const isDouble =
          second >=
            DOUBLE_THRESHOLD &&
          second >=
            highest * 0.80

        if (
          isDouble
        ) {
          answers[
            questionNumber
          ] = ""

          doubleCount++

          debugData.push({
            number:
              questionNumber,
            values,
            answer:
              "GANDA",
          })

          continue
        }

        const answer =
          choices[
            ranked[0]
              .index
          ]

        answers[
          questionNumber
        ] = answer

        answeredCount++

        debugData.push({
          number:
            questionNumber,
          values,
          answer,
        })
      }

      console.log(
        "========== OMR AUTO CALIBRATED =========="
      )

      console.log(
        "X Centers:",
        columnXCenters
      )

      console.log(
        "Y Centers:",
        rowYCenters
      )

      console.table(
        debugData
      )

      console.log(
        "Jawaban siswa:",
        answers
      )

      console.log(
        "=========================================="
      )

      const debug =
        `📝 OMR Auto-Calibrated` +
        ` | Kolom: ${columnCount}` +
        ` | Baca: ${answeredCount}/${totalQuestions}` +
        ` | Kosong: ${emptyCount}` +
        ` | Ganda: ${doubleCount}`

      return {
        answers,
        debug,
      }
    } catch (error) {
      console.error(
        "ERROR READ OMR:",
        error
      )

      return {
        answers: {},
        debug:
          `❌ Gagal membaca jawaban: ${
            error?.message ||
            "error tidak diketahui"
          }`,
      }
    } finally {
      if (source)
        source.delete()

      if (gray)
        gray.delete()

      if (blur)
        blur.delete()
    }
  }

  // =====================================================
  // HANDLE SCAN
  // =====================================================

  const handleScan = async () => {
    if (!videoRef.current) {
      return
    }

    setScanning(true)
    setMessage("")
    setPreview(null)
    setCorrectionResult(null)

    try {
      const answerKeys =
        await getAnswerKey()

      if (
        answerKeys.length === 0
      ) {
        setMessage(
          "Kunci jawaban untuk ujian ini belum tersedia."
        )

        setScanning(false)
        return
      }

      const video =
        videoRef.current

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

      // ================================================
      // FOTO KAMERA
      // ================================================

      const canvas =
        document.createElement(
          "canvas"
        )

      canvas.width =
        video.videoWidth

      canvas.height =
        video.videoHeight

      const context =
        canvas.getContext(
          "2d",
          {
            willReadFrequently:
              true,
          }
        )

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      )

      // ================================================
      // DETEKSI MARKER
      // ================================================

      setMessage(
        "Mencari batas kertas LJK..."
      )

      const detection =
        detectAnswerSheet(
          canvas
        )

      console.log(
        "HASIL DETEKSI:",
        detection
      )

      if (
        !detection.detected
      ) {
        setMessage(
          detection.message
        )

        setPreview(
          canvas.toDataURL(
            "image/jpeg",
            0.9
          )
        )

        setScanning(false)
        return
      }

      // ================================================
      // WARP
      // ================================================

      setMessage(
        "Meluruskan LJK..."
      )

      const correctedCanvas =
        warpAnswerSheet(
          canvas,
          detection.markers
        )

      if (
        !correctedCanvas
      ) {
        setMessage(
          "❌ Gagal meluruskan LJK."
        )

        setScanning(false)
        return
      }

      setPreview(
        correctedCanvas.toDataURL(
          "image/jpeg",
          0.95
        )
      )

      // ================================================
      // BACA JAWABAN
      // ================================================

      setMessage(
        "Membaca jawaban siswa..."
      )

      const scanResult =
        readStudentAnswers(
          correctedCanvas,
          answerKeys.length
        )

      console.log(
        "HASIL OMR:",
        scanResult
      )

      const detectedAnswers =
        scanResult?.answers ||
        {}

      setStudentAnswers(
        detectedAnswers
      )

      // ================================================
      // KOREKSI
      // ================================================

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
          error?.message ||
          "tidak diketahui"
        }`
      )
    }

    setScanning(false)
  }

  // =====================================================
  // UI
  // =====================================================

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

        {/* DATA UJIAN */}
        <div className="rounded-2xl bg-white p-5 shadow-sm md:p-6">

          <label className="mb-2 block font-semibold text-slate-700">
            Pilih Ujian
          </label>

          <select
            value={selectedExam}
            onChange={(e) => {
              setSelectedExam(
                e.target.value
              )

              setCorrectionResult(
                null
              )

              setStudentAnswers(
                {}
              )

              setPreview(null)
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
                {exam.title ||
                  exam.name ||
                  "Ujian"}
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
              onChange={(e) =>
                setStudentName(
                  e.target.value
                )
              }
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
            Pastikan seluruh LJK terlihat di dalam kotak.
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
                  Kamera akan digunakan untuk memindai lembar jawaban siswa.
                </p>

                <button
                  onClick={
                    startCamera
                  }
                  disabled={
                    !selectedExam ||
                    !studentName.trim()
                  }
                  className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📷 Buka Scanner
                </button>

              </div>
            )}
          </div>

          {/* BUTTON */}
          {cameraOpen && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">

              <button
                onClick={
                  stopCamera
                }
                className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>

              <button
                onClick={
                  handleScan
                }
                disabled={
                  scanning
                }
                className="flex-1 rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {scanning
                  ? "⏳ Memindai..."
                  : "🔍 Scan Lembar Jawaban"}
              </button>

            </div>
          )}

          {/* MESSAGE */}
          {message && (
            <div className="mt-5 whitespace-pre-line rounded-xl bg-gray-100 p-4 text-center text-sm text-gray-700">
              {message}
            </div>
          )}

          {/* HASIL KOREKSI */}
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

              {/* DETAIL */}
              <div className="mt-6 overflow-x-auto">

                <table className="w-full border-collapse">

                  <thead>
                    <tr className="border-b bg-gray-50 text-left">
                      <th className="p-3">
                        No
                      </th>

                      <th className="p-3">
                        Jawaban Siswa
                      </th>

                      <th className="p-3">
                        Kunci Jawaban
                      </th>

                      <th className="p-3">
                        Hasil
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {correctionResult.details.map(
                      (item) => (
                        <tr
                          key={
                            item.number
                          }
                          className="border-b"
                        >

                          <td className="p-3">
                            {
                              item.number
                            }
                          </td>

                          <td className="p-3">
                            {
                              item.studentAnswer ||
                              "-"
                            }
                          </td>

                          <td className="p-3">
                            {
                              item.correctAnswer
                            }
                          </td>

                          <td className="p-3">
                            {item.status ===
                              "correct" &&
                              "✅ Benar"}

                            {item.status ===
                              "wrong" &&
                              "❌ Salah"}

                            {item.status ===
                              "empty" &&
                              "⬜ Kosong"}
                          </td>

                        </tr>
                      )
                    )}
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