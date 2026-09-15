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
      50,
      150
    )

    // Perbesar sedikit garis tepi
    const kernel = cv.Mat.ones(
      3,
      3,
      cv.CV_8U
    )

    cv.dilate(
      edges,
      edges,
      kernel
    )

    kernel.delete()

    contours = new cv.MatVector()
    hierarchy = new cv.Mat()

    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    )

    let bestContour = null
    let bestArea = 0

    const imageArea =
      canvas.width * canvas.height

    for (
      let i = 0;
      i < contours.size();
      i++
    ) {
      const contour =
        contours.get(i)

      const area =
        cv.contourArea(contour)

      // Kertas harus cukup besar
      if (
        area < imageArea * 0.20 ||
        area > imageArea * 0.95
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
        perimeter * 0.02,
        true
      )

      // Cari kontur yang benar-benar
      // memiliki 4 sudut
      if (
        approx.rows === 4 &&
        area > bestArea
      ) {
        if (bestContour) {
          bestContour.delete()
        }

        bestContour =
          approx.clone()

        bestArea = area
      }

      approx.delete()
      contour.delete()
    }

    if (!bestContour) {
      return null
    }

    // ==========================================
    // AMBIL 4 SUDUT ASLI KERTAS
    // ==========================================

    const points = []

    for (
      let i = 0;
      i < bestContour.rows;
      i++
    ) {
      const x =
        bestContour.intPtr(i, 0)[0]

      const y =
        bestContour.intPtr(i, 0)[1]

      points.push({
        x,
        y
      })
    }

    // ==========================================
    // URUTKAN:
    // kiri atas
    // kanan atas
    // kanan bawah
    // kiri bawah
    // ==========================================

    const sum = p =>
      p.x + p.y

    const diff = p =>
      p.x - p.y

    const topLeft =
      points.reduce(
        (best, p) =>
          sum(p) < sum(best)
            ? p
            : best
      )

    const bottomRight =
      points.reduce(
        (best, p) =>
          sum(p) > sum(best)
            ? p
            : best
      )

    const topRight =
      points.reduce(
        (best, p) =>
          diff(p) > diff(best)
            ? p
            : best
      )

    const bottomLeft =
      points.reduce(
        (best, p) =>
          diff(p) < diff(best)
            ? p
            : best
      )

    bestContour.delete()

    return [
      topLeft,
      topRight,
      bottomRight,
      bottomLeft
    ]

  } catch (error) {
    console.error(
      "ERROR DETEKSI LJK:",
      error
    )

    return null

  } finally {
    if (src) src.delete()
    if (gray) gray.delete()
    if (blur) blur.delete()
    if (edges) edges.delete()
    if (contours) contours.delete()
    if (hierarchy) hierarchy.delete()
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
    const width = 840
    const height = 1320

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
      debug: "OpenCV belum siap."
    }
  }

  const cv = window.cv

  let src = null
  let gray = null
  let blur = null
  let circles = null

  try {

    // =====================================================
    // BACA GAMBAR
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
      new cv.Size(3, 3),
      0
    )


    // =====================================================
    // KONFIGURASI LJK
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


    // =====================================================
    // UKURAN BUBBLE
    // Sama dengan AnswerSheet.jsx
    // =====================================================

    let bubbleSizeMm

    if (
      totalQuestions >= 100
    ) {
      bubbleSizeMm = 4
    } else if (
      totalQuestions >= 90
    ) {
      bubbleSizeMm = 4.2
    } else if (
      totalQuestions >= 80
    ) {
      bubbleSizeMm = 4.3
    } else if (
      totalQuestions >= 70
    ) {
      bubbleSizeMm = 4.5
    } else {
      bubbleSizeMm = 5
    }


    // =====================================================
    // PIXEL PER MM
    // =====================================================

    const pxPerMm =
      canvas.width / 210

    const expectedRadius =
      (
        bubbleSizeMm / 2
      ) * pxPerMm


    // =====================================================
    // DETEKSI CIRCLE
    // =====================================================

    circles = new cv.Mat()

    const minRadius =
      Math.max(
        4,
        Math.floor(
          expectedRadius * 0.55
        )
      )

    const maxRadius =
      Math.ceil(
        expectedRadius * 1.6
      )

    const minDistance =
      Math.max(
        7,
        Math.floor(
          expectedRadius * 1.5
        )
      )

    cv.HoughCircles(
      blur,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      minDistance,
      100,
      12,
      minRadius,
      maxRadius
    )


    // =====================================================
    // AMBIL CIRCLE
    // =====================================================

    const rawCircles = []

    for (
      let i = 0;
      i < circles.cols;
      i++
    ) {

      const x =
        circles.data32F[i * 3]

      const y =
        circles.data32F[i * 3 + 1]

      const r =
        circles.data32F[i * 3 + 2]


      // Area PG saja
      if (
        y < canvas.height * 0.20 ||
        y > canvas.height * 0.78
      ) {
        continue
      }

      if (
        r < minRadius ||
        r > maxRadius
      ) {
        continue
      }

      rawCircles.push({
        x,
        y,
        r
      })
    }


    // =====================================================
    // HAPUS DUPLIKAT
    // =====================================================

    const detectedCircles = []

    for (
      const circle of rawCircles
    ) {

      const duplicate =
        detectedCircles.some(
          existing => {

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

            return (
              distance <
              Math.max(
                circle.r,
                existing.r
              ) * 0.8
            )
          }
        )

      if (!duplicate) {
        detectedCircles.push(
          circle
        )
      }
    }


    // =====================================================
    // CEK CIRCLE
    // =====================================================

    if (
      detectedCircles.length < 20
    ) {
      return {
        answers: {},
        debug:
          `❌ Bubble tidak cukup terdeteksi. ` +
          `Terdeteksi ${detectedCircles.length} circle.`
      }
    }


    // =====================================================
    // CLUSTER X
    // =====================================================

    const sortedByX =
      [...detectedCircles]
        .sort(
          (a, b) =>
            a.x - b.x
        )

    const xClusters = []

    const xTolerance =
      Math.max(
        7,
        expectedRadius * 1.5
      )

    for (
      const circle of sortedByX
    ) {

      let nearest = null
      let nearestDistance =
        Infinity

      for (
        const cluster of xClusters
      ) {

        const distance =
          Math.abs(
            circle.x -
            cluster.centerX
          )

        if (
          distance <
          nearestDistance
        ) {
          nearest =
            cluster

          nearestDistance =
            distance
        }
      }

      if (
        nearest &&
        nearestDistance <=
          xTolerance
      ) {

        nearest.points.push(
          circle
        )

        nearest.centerX =
          nearest.points.reduce(
            (sum, p) =>
              sum + p.x,
            0
          ) /
          nearest.points.length

      } else {

        xClusters.push({
          centerX: circle.x,
          points: [circle]
        })
      }
    }


    // =====================================================
    // FILTER JALUR
    // =====================================================

    const minimumTrackCount =
      Math.max(
        5,
        Math.floor(
          questionsPerColumn *
          0.18
        )
      )

    let validXClusters =
      xClusters.filter(
        cluster =>
          cluster.points.length >=
          minimumTrackCount
      )


    validXClusters.sort(
      (a, b) =>
        a.centerX -
        b.centerX
    )


    const expectedTracks =
      columnCount * 5


    // =====================================================
    // KALAU TERLALU BANYAK JALUR
    // =====================================================

    if (
      validXClusters.length >
      expectedTracks
    ) {

      validXClusters =
        [...validXClusters]
          .sort(
            (a, b) =>
              b.points.length -
              a.points.length
          )
          .slice(
            0,
            expectedTracks
          )
          .sort(
            (a, b) =>
              a.centerX -
              b.centerX
          )
    }


    if (
      validXClusters.length <
      expectedTracks
    ) {

      return {
        answers: {},
        debug:
          `❌ Jalur bubble tidak lengkap. ` +
          `Ditemukan ${validXClusters.length}/${expectedTracks} jalur. ` +
          `Circle: ${detectedCircles.length}`
      }
    }


    // =====================================================
    // BAGI MENJADI KOLOM
    // =====================================================

    const columns = []

    for (
      let c = 0;
      c < columnCount;
      c++
    ) {

      columns.push(
        validXClusters.slice(
          c * 5,
          c * 5 + 5
        )
      )
    }


    // =====================================================
    // HITUNG TINTA
    //
    // HANYA BAGIAN TENGAH BUBBLE
    // GARIS LINGKARAN TIDAK DIHITUNG
    // =====================================================

    const calculateInk = (
      centerX,
      centerY,
      radius
    ) => {

      const innerRadius =
        Math.max(
          2,
          radius * 0.45
        )

      let darkPixels = 0
      let totalPixels = 0

      const minX =
        Math.floor(
          centerX -
          innerRadius
        )

      const maxX =
        Math.ceil(
          centerX +
          innerRadius
        )

      const minY =
        Math.floor(
          centerY -
          innerRadius
        )

      const maxY =
        Math.ceil(
          centerY +
          innerRadius
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
            x - centerX

          const dy =
            y - centerY

          if (
            dx * dx +
            dy * dy >
            innerRadius *
            innerRadius
          ) {
            continue
          }

          const value =
            gray.ucharPtr(
              y,
              x
            )[0]

          totalPixels++

          // Pensil tipis tetap dihitung
          if (
            value < 200
          ) {
            darkPixels++
          }
        }
      }

      if (
        totalPixels === 0
      ) {
        return 0
      }

      return (
        darkPixels /
        totalPixels
      )
    }


    // =====================================================
    // KOREKSI KEMIRINGAN BARIS
    //
    // Ini bagian penting.
    //
    // Kalau kertas miring, Y bubble A-E
    // tidak harus sama persis.
    //
    // Kita estimasi kemiringan dari
    // semua circle dalam satu kolom.
    // =====================================================

    const getTiltSlope = (
      column
    ) => {

      const points = []

      column.forEach(
        track => {

          track.points.forEach(
            point => {

              points.push({
                x: point.x,
                y: point.y
              })

            }
          )

        }
      )


      if (
        points.length < 10
      ) {
        return 0
      }


      const meanX =
        points.reduce(
          (sum, p) =>
            sum + p.x,
          0
        ) /
        points.length

      const meanY =
        points.reduce(
          (sum, p) =>
            sum + p.y,
          0
        ) /
        points.length


      let numerator = 0
      let denominator = 0

      points.forEach(
        p => {

          numerator +=
            (
              p.x - meanX
            ) *
            (
              p.y - meanY
            )

          denominator +=
            (
              p.x - meanX
            ) *
            (
              p.x - meanX
            )
        }
      )


      if (
        denominator === 0
      ) {
        return 0
      }

      return (
        numerator /
        denominator
      )
    }


    // =====================================================
    // NORMALISASI Y
    //
    // yCorrected = y - slope*x
    //
    // Jadi kertas miring sedikit
    // tetap dianggap satu baris.
    // =====================================================

    const normalizeY = (
      point,
      slope
    ) => {

      return (
        point.y -
        slope * point.x
      )
    }


    // =====================================================
    // GROUP BARIS
    // =====================================================

    const groupRows = (
      column,
      slope
    ) => {

      const allPoints = []

      column.forEach(
        track => {

          track.points.forEach(
            point => {

              allPoints.push({
                x: point.x,
                y: point.y,
                r: point.r,
                normalizedY:
                  normalizeY(
                    point,
                    slope
                  )
              })

            }
          )

        }
      )


      allPoints.sort(
        (a, b) =>
          a.normalizedY -
          b.normalizedY
      )


      const rows = []

      const yTolerance =
        Math.max(
          5,
          expectedRadius * 1.25
        )


      for (
        const point of allPoints
      ) {

        let nearest = null
        let nearestDistance =
          Infinity

        for (
          const row of rows
        ) {

          const distance =
            Math.abs(
              point.normalizedY -
              row.centerY
            )

          if (
            distance <
            nearestDistance
          ) {

            nearest =
              row

            nearestDistance =
              distance
          }
        }


        if (
          nearest &&
          nearestDistance <=
            yTolerance
        ) {

          nearest.points.push(
            point
          )

          nearest.centerY =
            nearest.points.reduce(
              (sum, p) =>
                sum +
                p.normalizedY,
              0
            ) /
            nearest.points.length

        } else {

          rows.push({
            centerY:
              point.normalizedY,

            points: [
              point
            ]
          })

        }
      }


      rows.sort(
        (a, b) =>
          a.centerY -
          b.centerY
      )


      return rows
    }


    // =====================================================
    // JAWABAN
    // =====================================================

    const choices = [
      "A",
      "B",
      "C",
      "D",
      "E"
    ]

    const answers = {}

    let questionNumber = 1

    let answeredCount = 0

    let doubleCount = 0

    let totalRowsDetected = 0


    // =====================================================
    // PROSES SETIAP KOLOM
    // =====================================================

    for (
      let columnIndex = 0;
      columnIndex < columnCount;
      columnIndex++
    ) {

      const column =
        columns[columnIndex]


      // Hitung kemiringan kolom
      const slope =
        getTiltSlope(
          column
        )


      const rows =
        groupRows(
          column,
          slope
        )


      // ===================================================
      // AMBIL JUMLAH BARIS SESUAI JUMLAH SOAL
      // ===================================================

      const rowCount =
        Math.min(
          rows.length,
          questionsPerColumn
        )

      totalRowsDetected +=
        rowCount


      // ===================================================
      // PROSES SETIAP BARIS
      // ===================================================

      for (
        let rowIndex = 0;
        rowIndex < rowCount;
        rowIndex++
      ) {

        const row =
          rows[rowIndex]


        const inkValues = []


        // =================================================
        // A - E
        // =================================================

        for (
          let choiceIndex = 0;
          choiceIndex < 5;
          choiceIndex++
        ) {

          const track =
            column[
              choiceIndex
            ]


          let bestPoint = null

          let bestDistance =
            Infinity


          // Cari circle pada jalur
          // yang paling dekat dengan baris
          for (
            const point of
            track.points
          ) {

            const normalizedPointY =
              normalizeY(
                point,
                slope
              )

            const distance =
              Math.abs(
                normalizedPointY -
                row.centerY
              )


            if (
              distance <
              bestDistance
            ) {

              bestDistance =
                distance

              bestPoint =
                point
            }
          }


          // =================================================
          // JANGAN PAKAI POSISI RATA-RATA
          //
          // Kalau circle memang tidak terdeteksi,
          // anggap kosong.
          // =================================================

          if (
            bestPoint &&
            bestDistance <=
              expectedRadius * 1.5
          ) {

            const ink =
              calculateInk(
                bestPoint.x,
                bestPoint.y,
                bestPoint.r
              )

            inkValues.push(
              ink
            )

          } else {

            inkValues.push(
              0
            )
          }
        }


        // =================================================
        // CARI TINTA PALING TEBAL
        // =================================================

        let highestIndex = 0

        for (
          let i = 1;
          i < inkValues.length;
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


        const highest =
          inkValues[
            highestIndex
          ]


        const sorted =
          [...inkValues]
            .sort(
              (a, b) =>
                b - a
            )


        const second =
          sorted[1] || 0


        // =================================================
        // THRESHOLD
        //
        // Kalau ada coretan yang cukup jelas
        // dianggap TIDAK KOSONG.
        // =================================================

        const emptyThreshold =
          totalQuestions >= 80
            ? 0.08
            : 0.07


        const doubleRatio =
          0.78


        // =================================================
        // TENTUKAN JAWABAN
        // =================================================

        if (
          highest <
          emptyThreshold
        ) {

          answers[
            questionNumber
          ] = ""

        } else if (
          second >=
          highest *
          doubleRatio
        ) {

          // Dua bubble sama-sama terisi
          answers[
            questionNumber
          ] = ""

          doubleCount++

        } else {

          answers[
            questionNumber
          ] =
            choices[
              highestIndex
            ]

          answeredCount++
        }


        // =================================================
        // DEBUG
        // =================================================

        console.log(
          `SOAL ${questionNumber}`,
          inkValues.map(
            value =>
              Number(
                value.toFixed(3)
              )
          ),
          "Y:",
          Math.round(
            row.centerY
          ),
          "Slope:",
          Number(
            slope.toFixed(4)
          )
        )


        questionNumber++
      }
    }


    // =====================================================
    // HASIL
    // =====================================================

    return {

      answers,

      debug:
        `🔎 Circle: ${detectedCircles.length} | ` +
        `Jalur: ${validXClusters.length}/${expectedTracks} | ` +
        `Baris: ${totalRowsDetected} | ` +
        `Terbaca: ${answeredCount}/${totalQuestions} | ` +
        `Ganda: ${doubleCount}`
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
        error.message
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