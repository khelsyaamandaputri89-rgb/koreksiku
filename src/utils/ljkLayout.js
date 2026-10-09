// =====================================================
// LAYOUT LJK (SATU SUMBER UNTUK AnswerSheet & Correction)
// Semua satuan dalam mm, kecuali disebutkan lain.
// =====================================================

export const PAPER_W = 210
export const PAPER_H = 330

export const MARKER_SIZE = 8
export const MARKER_OFFSET = 7
export const MARKER_CENTER = MARKER_OFFSET + MARKER_SIZE / 2 // 11mm dari tepi

export const MARGIN_X = 15
export const CONTENT_WIDTH = 180

export const MCQ_TOP = 100
export const MCQ_TITLE_HEIGHT = 8
export const ESSAY_TITLE_HEIGHT = 7

const BOTTOM_LIMIT = PAPER_H - 14

export function getLJKLayout(totalQuestions, essayCount = 0) {
  const columnCount = totalQuestions >= 80 ? 3 : 2
  const questionsPerColumn = Math.ceil(totalQuestions / columnCount)

  const rowHeight =
    totalQuestions >= 80 ? 4.8 : totalQuestions >= 60 ? 5 : 5.5

  const bubbleSize =
    totalQuestions >= 100 ? 4
    : totalQuestions >= 90 ? 4.2
    : totalQuestions >= 80 ? 4.3
    : totalQuestions >= 70 ? 4.5
    : 5

  const columnGap = columnCount === 3 ? 5 : 10
  const colWidth =
    (CONTENT_WIDTH - columnGap * (columnCount - 1)) / columnCount

  const numberWidth = columnCount === 3 ? 7 : 9
  const numberMargin = 1.5
  const choiceWidth = columnCount === 3 ? 7.2 : 10
  const choiceGap = columnCount === 3 ? 0.6 : 1
  const fontPx = columnCount === 3 ? 6 : 7

  const gridTop = MCQ_TOP + MCQ_TITLE_HEIGHT
  const gridBottom = gridTop + questionsPerColumn * rowHeight

  // ---- ESSAY ----
  const essayTop = gridBottom + 4

  const baseLines =
    totalQuestions <= 45 ? 22
    : totalQuestions <= 50 ? 19
    : totalQuestions <= 60 ? 15
    : totalQuestions <= 70 ? 11
    : totalQuestions <= 80 ? 8
    : totalQuestions <= 90 ? 6
    : 5

  const essayLineHeight =
    totalQuestions <= 50 ? 6
    : totalQuestions <= 70 ? 5
    : totalQuestions <= 80 ? 4.5
    : totalQuestions <= 90 ? 4
    : 3.8

  // jangan sampai garis essay keluar dari kertas
  const available = BOTTOM_LIMIT - essayTop - ESSAY_TITLE_HEIGHT
  const essayLineCount =
    essayCount > 0
      ? Math.max(1, Math.min(baseLines, Math.floor(available / essayLineHeight)))
      : 0

  return {
    columnCount,
    questionsPerColumn,
    rowHeight,
    bubbleSize,
    columnGap,
    colWidth,
    numberWidth,
    numberMargin,
    choiceWidth,
    choiceGap,
    fontPx,
    marginX: MARGIN_X,
    contentWidth: CONTENT_WIDTH,
    mcqTop: MCQ_TOP,
    titleHeight: MCQ_TITLE_HEIGHT,
    gridTop,
    essayTop,
    essayTitleHeight: ESSAY_TITLE_HEIGHT,
    essayLineCount,
    essayLineHeight,
  }
}

// Pusat bubble (mm dari pojok kiri atas kertas)
// questionIndex 0-based, choiceIndex 0-4 (A-E)
export function getBubbleCenter(layout, questionIndex, choiceIndex) {
  const col = Math.floor(questionIndex / layout.questionsPerColumn)
  const row = questionIndex % layout.questionsPerColumn

  const colX = layout.marginX + col * (layout.colWidth + layout.columnGap)

  return {
    x:
      colX +
      layout.numberWidth +
      layout.numberMargin +
      choiceIndex * layout.choiceWidth +
      layout.bubbleSize / 2,
    y: layout.gridTop + row * layout.rowHeight + layout.rowHeight / 2,
    col,
  }
}