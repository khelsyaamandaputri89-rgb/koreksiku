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
  // BACA JAWABAN DINAMIS
  // =========================

  const readStudentAnswers = (canvas, totalQuestions) => {
    if (!window.cv || !window.cv.Mat) {
      return {}
    }

    const cv = window.cv

    let src = null
    let gray = null
    let circles = null

    try {
      src = cv.imread(canvas)

      gray = new cv.Mat()

      cv.cvtColor(
        src,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      cv.GaussianBlur(
        gray,
        gray,
        new cv.Size(5, 5),
        1.5,
        1.5,
        cv.BORDER_DEFAULT
      )

      circles = new cv.Mat()

      /*
        =====================================
        JUMLAH KOLOM OTOMATIS
        =====================================
      */

      let columnCount = 2

      if (
        totalQuestions >= 80 &&
        totalQuestions <= 100
      ) {
        columnCount = 3
      }

      /*
        40-70 = 2 kolom
        80-100 = 3 kolom
      */

      const questionsPerColumn = Math.ceil(
        totalQuestions / columnCount
      )

      console.log(
        "TOTAL SOAL:",
        totalQuestions
      )

      console.log(
        "JUMLAH KOLOM:",
        columnCount
      )

      console.log(
        "SOAL PER KOLOM:",
        questionsPerColumn
      )

      /*
        =====================================
        DETEKSI SEMUA BUBBLE
        =====================================
      */

      cv.HoughCircles(
        gray,
        circles,
        cv.HOUGH_GRADIENT,
        1,
        15,
        100,
        20,
        7,
        18
      )

      const detectedCircles = []

      for (
        let i = 0;
        i < circles.cols;
        i++
      ) {
        const x =
          circles.data32F[i * 3]

        const y =
          circles.data32F[i * 3 + 1]

        const radius =
          circles.data32F[i * 3 + 2]

        /*
          Abaikan lingkaran yang terlalu kecil/besar
        */

        if (
          radius < 7 ||
          radius > 18
        ) {
          continue
        }

        /*
          Abaikan bagian header/footer.
          Area jawaban biasanya berada
          di bagian tengah LJK.
        */

        if (
          y < 250 ||
          y > 850
        ) {
          continue
        }

        detectedCircles.push({
          x,
          y,
          radius
        })
      }

      console.log(
        "BUBBLE AWAL TERDETEKSI:",
        detectedCircles.length
      )

      /*
        =====================================
        HAPUS DUPLIKAT
        =====================================
      */

      const uniqueCircles = []

      detectedCircles.forEach(
        (circle) => {

          const duplicate =
            uniqueCircles.some(
              (existing) => {

                const dx =
                  existing.x - circle.x

                const dy =
                  existing.y - circle.y

                const distance =
                  Math.sqrt(
                    dx * dx +
                    dy * dy
                  )

                return distance < 10
              }
            )

          if (!duplicate) {
            uniqueCircles.push(circle)
          }
        }
      )

      console.log(
        "BUBBLE SETELAH DUPLIKAT DIHAPUS:",
        uniqueCircles.length
      )

      /*
        =====================================
        CEK JUMLAH BUBBLE
        =====================================

        Setiap soal punya 5 bubble.

        Contoh:
        45 soal = 225 bubble
        50 soal = 250 bubble
      */

      const expectedBubbleCount =
        totalQuestions * 5

      console.log(
        "BUBBLE SEHARUSNYA:",
        expectedBubbleCount
      )

      /*
        =====================================
        KELOMPOKKAN BUBBLE BERDASARKAN KOLOM
        =====================================
      */

      const sortedByX =
        [...uniqueCircles].sort(
          (a, b) => a.x - b.x
        )

      /*
        Kita cari jarak antar bubble
        yang cukup besar untuk dianggap
        sebagai pemisah antar kolom.
      */

      const columns = []

      sortedByX.forEach(
        (bubble) => {

          let nearestColumn = null

          let smallestDistance =
            Infinity

          columns.forEach(
            (column) => {

              const distance =
                Math.abs(
                  column.centerX -
                  bubble.x
                )

              if (
                distance <
                smallestDistance
              ) {
                smallestDistance =
                  distance

                nearestColumn =
                  column
              }
            }
          )

          /*
            Bubble pilihan A-E
            biasanya masih berada
            dalam jarak yang relatif dekat.

            Kalau terlalu jauh,
            buat kolom baru.
          */

          if (
            nearestColumn &&
            smallestDistance < 180
          ) {
            nearestColumn.bubbles.push(
              bubble
            )

            /*
              Update center X
            */

            const totalX =
              nearestColumn.bubbles.reduce(
                (sum, item) =>
                  sum + item.x,
                0
              )

            nearestColumn.centerX =
              totalX /
              nearestColumn.bubbles.length

          } else {

            columns.push({
              centerX: bubble.x,
              bubbles: [bubble]
            })
          }
        }
      )

      /*
        =====================================
        GABUNGKAN KOLOM YANG TERLALU DEKAT
        =====================================
      */

      columns.sort(
        (a, b) =>
          a.centerX -
          b.centerX
      )

      const mergedColumns = []

      columns.forEach(
        (column) => {

          const last =
            mergedColumns[
              mergedColumns.length - 1
            ]

          if (
            last &&
            Math.abs(
              last.centerX -
              column.centerX
            ) < 180
          ) {

            last.bubbles.push(
              ...column.bubbles
            )

            const totalX =
              last.bubbles.reduce(
                (sum, item) =>
                  sum + item.x,
                0
              )

            last.centerX =
              totalX /
              last.bubbles.length

          } else {

            mergedColumns.push({
              centerX:
                column.centerX,
              bubbles: [
                ...column.bubbles
              ]
            })
          }
        }
      )

      /*
        =====================================
        PILIH JUMLAH KOLOM YANG DIPERLUKAN
        =====================================
      */

      let finalColumns =
        mergedColumns

      /*
        Kalau hasil deteksi terlalu banyak
        kelompok, pilih kelompok dengan
        bubble terbanyak.
      */

      if (
        finalColumns.length >
        columnCount
      ) {

        finalColumns =
          [...finalColumns]
            .sort(
              (a, b) =>
                b.bubbles.length -
                a.bubbles.length
            )
            .slice(
              0,
              columnCount
            )

        finalColumns.sort(
          (a, b) =>
            a.centerX -
            b.centerX
        )
      }

      console.log(
        "KOLOM TERDETEKSI:",
        finalColumns.map(
          (column) => ({
            x:
              Math.round(
                column.centerX
              ),
            jumlah:
              column.bubbles.length
          })
        )
      )

      /*
        =====================================
        FUNGSI KELOMPOK BARIS
        =====================================
      */

      const groupRows = (
        bubbles
      ) => {

        const rows = []

        /*
          Urutkan berdasarkan Y
        */

        const sorted =
          [...bubbles].sort(
            (a, b) =>
              a.y - b.y
          )

        sorted.forEach(
          (bubble) => {

            let nearestRow = null

            let smallestDistance =
              Infinity

            rows.forEach(
              (row) => {

                const distance =
                  Math.abs(
                    row.centerY -
                    bubble.y
                  )

                if (
                  distance <
                  smallestDistance
                ) {
                  smallestDistance =
                    distance

                  nearestRow =
                    row
                }
              }
            )

            /*
              Bubble dalam satu baris
              biasanya memiliki Y
              yang hampir sama.
            */

            if (
              nearestRow &&
              smallestDistance < 18
            ) {

              nearestRow.bubbles.push(
                bubble
              )

              const totalY =
                nearestRow.bubbles.reduce(
                  (sum, item) =>
                    sum + item.y,
                  0
                )

              nearestRow.centerY =
                totalY /
                nearestRow.bubbles.length

            } else {

              rows.push({
                centerY: bubble.y,
                bubbles: [
                  bubble
                ]
              })
            }
          }
        )

        rows.sort(
          (a, b) =>
            a.centerY -
            b.centerY
        )

        /*
          Urutkan bubble A-E
          berdasarkan X
        */

        rows.forEach(
          (row) => {

            row.bubbles.sort(
              (a, b) =>
                a.x - b.x
            )
          }
        )

        return rows
      }

      /*
        =====================================
        HITUNG TINTA DALAM BUBBLE
        =====================================
      */

      const calculateInk =
        (bubble) => {

          const radius =
            Math.floor(
              bubble.radius * 0.55
            )

          const x =
            Math.round(
              bubble.x
            )

          const y =
            Math.round(
              bubble.y
            )

          const x1 =
            Math.max(
              0,
              x - radius
            )

          const y1 =
            Math.max(
              0,
              y - radius
            )

          const width =
            Math.min(
              radius * 2,
              gray.cols - x1
            )

          const height =
            Math.min(
              radius * 2,
              gray.rows - y1
            )

          if (
            width <= 0 ||
            height <= 0
          ) {
            return 0
          }

          const rect =
            new cv.Rect(
              x1,
              y1,
              width,
              height
            )

          const roi =
            gray.roi(rect)

          let darkPixels = 0
          let totalPixels = 0

          for (
            let yy = 0;
            yy < roi.rows;
            yy++
          ) {

            for (
              let xx = 0;
              xx < roi.cols;
              xx++
            ) {

              const value =
                roi.ucharPtr(
                  yy,
                  xx
                )[0]

              /*
                Pixel gelap =
                dianggap tinta
              */

              if (
                value < 130
              ) {
                darkPixels++
              }

              totalPixels++
            }
          }

          roi.delete()

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

      /*
        =====================================
        BACA SATU BARIS
        =====================================
      */

      const readRow = (
        row
      ) => {

        /*
          Harus ada 5 bubble:
          A B C D E
        */

        if (
          row.bubbles.length < 5
        ) {
          return ""
        }

        const bubbles =
          row.bubbles
            .slice(0, 5)

        const inkValues =
          bubbles.map(
            calculateInk
          )

        /*
          Cari tinta paling tebal
        */

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
            highestIndex = i
          }
        }

        const highest =
          inkValues[
            highestIndex
          ]

        const sorted =
          [...inkValues].sort(
            (a, b) =>
              b - a
          )

        const second =
          sorted[1] || 0

        /*
          Tidak ada tinta
        */

        if (
          highest < 0.12
        ) {
          return ""
        }

        /*
          Dua pilihan hampir sama tebal
          → dianggap kosong/ambigu
        */

        if (
          second >
          highest * 0.80
        ) {
          return ""
        }

        const choices = [
          "A",
          "B",
          "C",
          "D",
          "E"
        ]

        return choices[
          highestIndex
        ]
      }

      /*
        =====================================
        BACA SEMUA KOLOM
        =====================================
      */

      const answers = {}

      let questionNumber = 1

      finalColumns.forEach(
        (column, columnIndex) => {

          /*
            Urutkan baris
          */

          const rows =
            groupRows(
              column.bubbles
            )

          console.log(
            `KOLOM ${columnIndex + 1}:`,
            rows.length,
            "baris"
          )

          /*
            Ambil sesuai kebutuhan
          */

          rows
            .slice(
              0,
              questionsPerColumn
            )
            .forEach(
              (row) => {

                const answer =
                  readRow(row)

                answers[
                  questionNumber
                ] = answer

                console.log(
                  `SOAL ${questionNumber}:`,
                  answer
                )

                questionNumber++
              }
            )
        }
      )

      /*
        =====================================
        PASTIKAN SEMUA NOMOR SOAL ADA
        =====================================
      */

      for (
        let i = 1;
        i <= totalQuestions;
        i++
      ) {

        if (
          answers[i] === undefined
        ) {
          answers[i] = ""
        }
      }

      /*
        =====================================
        HASIL AKHIR
        =====================================
      */

      console.log(
        "================================"
      )

      console.log(
        "HASIL JAWABAN SISWA:",
        answers
      )

      console.log(
        "================================"
      )

      return answers

    } catch (error) {

      console.error(
        "ERROR MEMBACA JAWABAN:",
        error
      )

      return {}

    } finally {

      if (src) {
        src.delete()
      }

      if (gray) {
        gray.delete()
      }

      if (circles) {
        circles.delete()
      }
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