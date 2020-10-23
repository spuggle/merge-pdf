import { PDFDocument, PDFPage } from "pdf-lib";
import fs from "fs";
import { promisify } from "util";


const HOME = __dirname.split(/\\|\//g).slice(0, -1).join("\\");
const file = (ioDir: string, fileName: string) => `${HOME}\\${ioDir}\\${fileName}`;
const readFilePromise = promisify(fs.readFile);
const writeFilePromise = promisify(fs.writeFile);

const readInput = (fileName: string) => readFilePromise(file("in", fileName));
const writeOutput = (fileName: string, data: Uint8Array) => writeFilePromise(file("out", fileName), data);

fs.readdir(`${HOME}\\in`, async function(err, pdfFiles) {
  if (err) return console.error(err);

  const loadedPDFBuffers = await loadPDFBuffers(pdfFiles);
  const inputPDFs = await createPDFsFromBuffers(loadedPDFBuffers);
  const outputPDFs = await createBlankPDFs();
  const [ oddPDF, evenPDF ] = outputPDFs;

  const [ oddPages, evenPages ] = await sortAndArrangePDFs(inputPDFs, outputPDFs);

    for (const oddPage of oddPages) oddPDF.addPage(oddPage);
    for (const evenPage of evenPages) evenPDF.addPage(evenPage);

    await createPDFs(oddPDF, evenPDF);
});

function loadPDFBuffers(pdfFiles: string[]) {
  return Promise.all(pdfFiles.map(pdfFile => readInput(pdfFile)));
}

function createPDFsFromBuffers(loadedPDFBuffers: Buffer[]) {
  return Promise.all(
    loadedPDFBuffers.map(loadedPDFBuffer => PDFDocument.load(loadedPDFBuffer, {
      ignoreEncryption: true
    }))
  );
}

async function createBlankPDFs() {
  return await Promise.all([
    PDFDocument.create(),
    PDFDocument.create()
  ]);
}

async function sortAndArrangePDFs(inputPDFs: PDFDocument[], outputPDFs: [PDFDocument, PDFDocument]): Promise<[PDFPage[], PDFPage[]]> {
  return (await Promise.all(inputPDFs.map(sortPages(outputPDFs))))
    .reduce<[ PDFPage[], PDFPage[] ]>(arrangePages(), [[], []]);
}

function sortPages(outputPDFs: [PDFDocument, PDFDocument]): (value: PDFDocument, index: number, array: PDFDocument[]) => Promise<PDFPage[][]> {
  return async (inputPDF) => {
    let pageCount = inputPDF.getPageCount();
    if (pageCount % 2 === 1 && ++pageCount)
      inputPDF.addPage();

    const sortedPages: [number[], number[]] = [[], []];

    //sortedPages[0].push(0);

    for (let i = 0; i < pageCount; ++i)
      sortedPages[i % 2].push(i);

    return Promise.all(sortedPages.map(copySortedPages(outputPDFs, inputPDF)));
  };
}

function arrangePages(): (previousValue: [PDFPage[], PDFPage[]], currentValue: PDFPage[][], currentIndex: number, array: PDFPage[][][]) => [PDFPage[], PDFPage[]] {
  return ([allOdd, allEven], [odd, even]) => {
    allOdd.push(...odd);
    allEven.push(...even);

    return [allOdd, allEven];
  };
}

function copySortedPages(PDFs: [PDFDocument, PDFDocument], pdfDoc: PDFDocument): (value: number[], index: number, array: number[][]) => Promise<PDFPage[]> {
  return (sortedPageNumbers, i) => PDFs[i % 2].copyPages(pdfDoc, sortedPageNumbers);
}

async function createPDFs(oddPDF: PDFDocument, evenPDF: PDFDocument) {
  const [oddBytes, evenBytes] = await getPDFBytes(oddPDF, evenPDF);

  await createPDFFromBytes(evenBytes, oddBytes);
}

async function getPDFBytes(oddPDF: PDFDocument, evenPDF: PDFDocument): Promise<[Uint8Array, Uint8Array]> {
  return await Promise.all([
    oddPDF.save(),
    evenPDF.save()
  ]);
}

async function createPDFFromBytes(evenBytes: Uint8Array, oddBytes: Uint8Array) {
  await Promise.all([
    writeOutput("Even_Pages.pdf", evenBytes).then(() => console.log("Exported even pages")),
    writeOutput("Odd_Pages.pdf", oddBytes).then(() => console.log("Exported odd pages"))
  ]);
}

type CategorizedPages = [ PDFPage[], PDFPage[] ];