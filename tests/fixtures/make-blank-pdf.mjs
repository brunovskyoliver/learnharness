/** A valid PDF whose pages hold no text, like a scan with no text layer. Generated,
 *  not committed, so the fixture costs nothing. */
export function blankPdf(pages = 2) {
	const objects = [];
	const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ");
	objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
	objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`;
	for (let i = 0; i < pages; i++) {
		objects[3 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents ${4 + i * 2} 0 R /Resources << >> >>`;
		const stream = "0.8 g 20 20 260 360 re f";
		objects[4 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
	}
	let body = "%PDF-1.4\n";
	const offsets = [];
	for (let n = 1; n < objects.length; n++) {
		offsets[n] = body.length;
		body += `${n} 0 obj\n${objects[n]}\nendobj\n`;
	}
	const xref = body.length;
	body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
	for (let n = 1; n < objects.length; n++) body += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
	body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(body, "latin1");
}
