import http2 from "http2";
import { PDFDocument, PDFPage } from "pdf-lib";
import fs from "fs";
import { promisify } from "util";


type CategorizedPages = [ PDFPage[], PDFPage[] ];

const HOME = "E:\\Projects\\pdf-merge";
const file = (ioDir: string, fileName: string) => `${HOME}\\${ioDir}\\${fileName}`;
const readFilePromise = promisify(fs.readFile);
const writeFilePromise = promisify(fs.writeFile);

const readInput = (fileName: string) => readFilePromise(file("in", fileName));
const writeOutput = (fileName: string, data: Uint8Array) => writeFilePromise(file("out", fileName), data);

const server = http2.createServer();

fs.readdir(`${HOME}\\in`, async function(err, pdfFiles) {
  if (err) return console.error(err);

  const loadedPDFBuffers = await Promise.all(pdfFiles.map(pdfFile => readInput(pdfFile)));
  const pdfDocs = await Promise.all(loadedPDFBuffers.map(loadedPDFBuffer => PDFDocument.load(loadedPDFBuffer)));
  const PDFs = await Promise.all([
    PDFDocument.create(),
    PDFDocument.create()
  ]);
  const [ oddPDF, evenPDF ] = PDFs;

  const [ oddPages, evenPages ] = (await Promise.all(pdfDocs.map(async pdfDoc => {
    let pageCount = pdfDoc.getPageCount();
    if (pageCount % 2 === 1 && ++pageCount) pdfDoc.addPage();

    const sortedPages: [ number[], number[] ] = [ [], [] ];

    for (let i = 0; i < pageCount; ++i) sortedPages[i % 2].push(i);

    return Promise.all(sortedPages.map((sortedPageNumbers, i) => PDFs[i % 2].copyPages(pdfDoc, sortedPageNumbers)));
  })))
    .reduce(([ allOdd, allEven ], [ odd, even ]) => {
      allOdd.push(...odd);
      allEven.push(...even);
      
      return [ allOdd, allEven ];
    }, [ [], [] ]);

    for (const oddPage of oddPages) oddPDF.addPage(oddPage);
    for (const evenPage of evenPages) evenPDF.addPage(evenPage);

    const [ oddBytes, evenBytes ] = await Promise.all([
      oddPDF.save(),
      evenPDF.save()
    ]);

    await Promise.all([
      writeOutput("even.pdf", evenBytes).then(() => console.log("Outputted even.pdf")),
      writeOutput("odd.pdf", oddBytes).then(() => console.log("Outputted odd.pdf"))
    ]);
});

server.listen(37475);