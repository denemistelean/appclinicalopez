import jsPDF from 'jspdf';

describe('jsPDF del informe clínico', () => {
  it('arma un PDF de varias páginas con la API usada por el informe', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.addImage(png, 'PNG', 8, 8, pageW - 16, 10);
    pdf.addPage();
    pdf.text('Informe', 8, 20);

    const binario = pdf.output('arraybuffer');
    expect(binario.byteLength).toBeGreaterThan(500);
    expect(pageH).toBeGreaterThan(pageW);
    expect(pdf.getNumberOfPages()).toBe(2);
  });
});
