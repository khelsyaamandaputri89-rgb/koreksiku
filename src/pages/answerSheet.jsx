import { useState } from "react"
import { getLJKLayout } from "../utils/ljkLayout"

function AnswerSheet() {
  const [template, setTemplate] = useState("45-5")

  const [schoolName, setSchoolName] = useState(
    "SMK ISLAM AL AMANAH"
  )

  const [schoolAddress, setSchoolAddress] = useState(
    "JL. KAUMAN BARAT"
  )

  const [isPrinting, setIsPrinting] = useState(false)

  // =====================================================
  // JUMLAH SOAL
  // =====================================================

  const [multipleChoiceCount, essayCount] =
    template.split("-").map(Number)

  // =====================================================
  // NOMOR SOAL
  // =====================================================

  const multipleChoiceQuestions = Array.from(
    {
      length: multipleChoiceCount,
    },
    (_, index) => index + 1
  )

  // =====================================================
  // JUMLAH KOLOM OTOMATIS
  //
  // 40–70 = 2 kolom
  // 80–100 = 3 kolom
  // =====================================================

  const layout = getLJKLayout(multipleChoiceCount, essayCount)

  const columns = Array.from({ length: layout.columnCount }, (_, index) =>
    multipleChoiceQuestions.slice(
      index * layout.questionsPerColumn,
      (index + 1) * layout.questionsPerColumn
    )
  )

  // =====================================================
  // CETAK F4
  // =====================================================

  const handlePrint = () => {
    setIsPrinting(true)

    const printStyle = document.createElement("style")

    printStyle.id = "answer-sheet-print-style"

    printStyle.innerHTML = `
      @page {
        size: 210mm 330mm;
        margin: 0;
      }

      @media print {
        html,
        body {
          width: 210mm !important;
          height: 330mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }

        body * {
          visibility: hidden;
        }

        #answer-sheet-print,
        #answer-sheet-print * {
          visibility: visible;
        }

        #answer-sheet-print {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 210mm !important;
          height: 330mm !important;
          margin: 0 !important;
          box-shadow: none !important;
        }
      }
    `

    document.head.appendChild(printStyle)

    setTimeout(() => {
      window.print()

      setTimeout(() => {
        const style =
          document.getElementById(
            "answer-sheet-print-style"
          )

        if (style) {
          style.remove()
        }

        setIsPrinting(false)
      }, 500)
    }, 300)
  }

  return (
    <div
      style={{
        minHeight: isPrinting
          ? "330mm"
          : "100vh",

        backgroundColor: isPrinting
          ? "#ffffff"
          : "#f3f4f6",

        padding: isPrinting
          ? "0"
          : "24px",

        fontFamily:
          "Arial, sans-serif",
      }}
    >

      {/* =====================================================
          PANEL PENGATURAN
      ====================================================== */}

      {!isPrinting && (
        <div
          style={{
            width: "100%",
            maxWidth: "900px",
            margin: "0 auto 24px auto",
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            boxShadow:
              "0 4px 15px rgba(0,0,0,0.08)",
          }}
        >

          {/* JUDUL */}

          <h1
            style={{
              margin: 0,
              fontSize: "28px",
              fontWeight: "700",
              color: "#1e293b",
            }}
          >
            Cetak Lembar Jawaban
          </h1>

          <p
            style={{
              marginTop: "8px",
              marginBottom: 0,
              fontSize: "15px",
              color: "#64748b",
            }}
          >
            Pilih jenis lembar jawaban yang ingin dicetak.
          </p>

          {/* =================================================
              JENIS LJK
          ================================================== */}

          <div
            style={{
              marginTop: "24px",
            }}
          >

            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "600",
                color: "#334155",
              }}
            >
              Jenis Lembar Jawaban
            </label>

            <select
              value={template}
              onChange={(e) =>
                setTemplate(e.target.value)
              }
              style={{
                width: "100%",
                padding: "13px 16px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "12px",
                backgroundColor: "#ffffff",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
              }}
            >

              <option value="45-5">
                Pilgan 45 + Essay 5
              </option>

              <option value="50-5">
                Pilgan 50 + Essay 5
              </option>

              <option value="60-5">
                Pilgan 60 + Essay 5
              </option>

              <option value="70-5">
                Pilgan 70 + Essay 5
              </option>

              <option value="80-5">
                Pilgan 80 + Essay 5
              </option>

              <option value="90-5">
                Pilgan 90 + Essay 5
              </option>

              <option value="100-5">
                Pilgan 100 + Essay 5
              </option>

              <option value="40-0">
                Full Pilgan 40
              </option>

              <option value="50-0">
                Full Pilgan 50
              </option>

              <option value="60-0">
                Full Pilgan 60
              </option>

              <option value="80-0">
                Full Pilgan 80
              </option>

              <option value="100-0">
                Full Pilgan 100
              </option>

            </select>

          </div>

          {/* =================================================
              DATA SEKOLAH
          ================================================== */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "16px",
              marginTop: "20px",
            }}
          >

            {/* NAMA SEKOLAH */}

            <div>

              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  color: "#334155",
                }}
              >
                Nama Sekolah
              </label>

              <input
                type="text"
                value={schoolName}
                onChange={(e) =>
                  setSchoolName(
                    e.target.value
                  )
                }
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  border:
                    "1px solid #d1d5db",
                  borderRadius: "12px",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

            </div>

            {/* ALAMAT SEKOLAH */}

            <div>

              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  color: "#334155",
                }}
              >
                Alamat Sekolah
              </label>

              <input
                type="text"
                value={schoolAddress}
                onChange={(e) =>
                  setSchoolAddress(
                    e.target.value
                  )
                }
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  border:
                    "1px solid #d1d5db",
                  borderRadius: "12px",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

            </div>

          </div>

          {/* =================================================
              TOMBOL CETAK
          ================================================== */}

          <button
            onClick={handlePrint}
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "14px 20px",
              border: "none",
              borderRadius: "12px",
              backgroundColor: "#1e293b",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            🖨️ Cetak LJK F4
          </button>

        </div>
      )}

      {/* =====================================================
          KERTAS F4
      ====================================================== */}

      <div
        id="answer-sheet-print"
        style={{
          position: "relative",

          width: "210mm",
          height: "330mm",

          margin: "0 auto",

          padding:
            "14mm 15mm 14mm",

          backgroundColor:
            "#ffffff",

          boxSizing:
            "border-box",

          overflow: "hidden",

          boxShadow: isPrinting
            ? "none"
            : "0 4px 20px rgba(0,0,0,0.15)",
        }}
      >

        {/* =================================================
            MARKER ATAS KIRI
        ================================================== */}

        <div
          style={{
            position: "absolute",
            top: "7mm",
            left: "7mm",
            width: "8mm",
            height: "8mm",
            backgroundColor: "#000000",
          }}
        />

        {/* MARKER ATAS KANAN */}

        <div
          style={{
            position: "absolute",
            top: "7mm",
            right: "7mm",
            width: "8mm",
            height: "8mm",
            backgroundColor: "#000000",
          }}
        />

        {/* =================================================
            KOP SEKOLAH
        ================================================== */}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "25mm",
            textAlign: "center",
          }}
        >

          {/* LOGO */}

          <div
            style={{
              width: "20mm",
              height: "20mm",
              border:
                "1px solid #000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "8px",
              marginRight: "7mm",
              flexShrink: 0,
            }}
          >
            LOGO
          </div>

          {/* NAMA SEKOLAH */}

          <div
            style={{
              flex: 1,
            }}
          >

            <div
              style={{
                fontSize: "17px",
                fontWeight: "800",
                textTransform: "uppercase",
              }}
            >
              {schoolName}
            </div>

            <div
              style={{
                marginTop: "3px",
                fontSize: "8px",
              }}
            >
              {schoolAddress}
            </div>

          </div>

        </div>

        {/* GARIS KOP */}

        <div
          style={{
            borderTop:
              "2px solid #000000",
            borderBottom:
              "1px solid #000000",
            height: "4px",
            marginBottom: "5px",
          }}
        />

        {/* =================================================
            JUDUL
        ================================================== */}

        <div
          style={{
            textAlign: "center",
          }}
        >

          <h1
            style={{
              margin:
                "3px 0 0 0",
              fontSize: "16px",
              fontWeight: "800",
            }}
          >
            LEMBAR JAWABAN
          </h1>

          <p
            style={{
              margin:
                "2px 0 0 0",
              fontSize: "8px",
              fontWeight: "700",
            }}
          >
            PILIHAN GANDA{" "}
            {multipleChoiceCount} SOAL

            {essayCount > 0 &&
              ` + ESSAY ${essayCount} SOAL`}
          </p>

        </div>

        {/* =================================================
            IDENTITAS
        ================================================== */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            columnGap: "12mm",
            rowGap: "2mm",
            marginTop: "6mm",
            fontSize: "8px",
          }}
        >

          {[
            "Nama",
            "Mapel",
            "Hari/Tanggal",
            "Kelas",
            "Ruang",
          ].map((label) => (
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "25mm 4mm 1fr",
                alignItems:
                  "center",
              }}
            >

              <span>
                {label}
              </span>

              <span>:</span>

              <div
                style={{
                  height: "4mm",
                  borderBottom:
                    "1px solid #000000",
                }}
              />

            </div>
          ))}

        </div>

        {/* =================================================
            PETUNJUK
        ================================================== */}

        <div
          style={{
            marginTop: "5mm",
            padding: "2.5mm",
            border:
              "1px solid #000000",
            fontSize: "7.5px",
          }}
        >

          <strong>
            Petunjuk:
          </strong>{" "}
          Hitamkan bulatan jawaban yang
          paling tepat. Gunakan pensil 2B
          atau alat tulis sesuai petunjuk
          pengawas.

        </div>

        {/* ================= PILIHAN GANDA (POSISI TETAP) ================= */}
        
        <div
          style={{
            position: "absolute",
            left: `${layout.marginX}mm`,
            top: `${layout.mcqTop}mm`,
            width: `${layout.contentWidth}mm`,
          }}
        >
          <div
            style={{
              height: `${layout.titleHeight}mm`,
              boxSizing: "border-box",
              borderBottom: "1px solid #000000",
              fontSize: "9px",
              fontWeight: "700",
              display: "flex",
              alignItems: "flex-end",
              paddingBottom: "1mm",
            }}
          >
            PILIHAN GANDA
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${layout.columnCount}, ${layout.colWidth}mm)`,
              columnGap: `${layout.columnGap}mm`,
            }}
          >
            {columns.map((column, columnIndex) => (
              <div key={columnIndex}>
                {column.map((number) => (
                  <div
                    key={number}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: `${layout.rowHeight}mm`,
                      fontSize: `${layout.fontPx}px`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        width: `${layout.numberWidth}mm`,
                        marginRight: `${layout.numberMargin}mm`,
                        textAlign: "right",
                        fontWeight: "700",
                        flexShrink: 0,
                      }}
                    >
                      {number}.
                    </span>

                    {["A", "B", "C", "D", "E"].map((choice) => (
                      <div
                        key={choice}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                          gap: `${layout.choiceGap}mm`,
                          width: `${layout.choiceWidth}mm`,
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: `${layout.bubbleSize}mm`,
                            height: `${layout.bubbleSize}mm`,
                            boxSizing: "border-box",
                            border: "1.2px solid #000000",
                            borderRadius: "50%",
                            flexShrink: 0,
                          }}
                        />
                        <span>{choice}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ================= ESSAY ================= */}
        {essayCount > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${layout.marginX}mm`,
              top: `${layout.essayTop}mm`,
              width: `${layout.contentWidth}mm`,
            }}
          >
            <div
              style={{
                height: `${layout.essayTitleHeight}mm`,
                boxSizing: "border-box",
                borderBottom: "1px solid #000000",
                fontSize: "9px",
                fontWeight: "700",
                display: "flex",
                alignItems: "flex-end",
                paddingBottom: "1mm",
              }}
            >
              ESSAY
            </div>

            {Array.from({ length: layout.essayLineCount }).map((_, index) => (
              <div
                key={index}
                style={{
                  width: "100%",
                  height: `${layout.essayLineHeight}mm`,
                  borderBottom: "1px solid #000000",
                  boxSizing: "border-box",
                }}
              />
            ))}
          </div>
        )}

        {/* =================================================
            MARKER BAWAH KIRI
        ================================================== */}

        <div
          style={{
            position: "absolute",
            bottom: "7mm",
            left: "7mm",
            width: "8mm",
            height: "8mm",
            backgroundColor:
              "#000000",
          }}
        />

        {/* MARKER BAWAH KANAN */}

        <div
          style={{
            position: "absolute",
            bottom: "7mm",
            right: "7mm",
            width: "8mm",
            height: "8mm",
            backgroundColor:
              "#000000",
          }}
        />

      </div>

    </div>
  )
}

export default AnswerSheet