function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Display every comparison and provide the unmodified HTML for inspection. */
export function appendInitializationEvidence(container, evidence, t) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = t.initializationEvidence;
  details.append(summary);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t.initializationDownload;
  button.onclick = () => download('initialization.json', JSON.stringify(evidence, null, 2), 'application/json');
  details.append(button);
  for (const comparison of evidence.comparisons) {
    const section = document.createElement('details');
    const title = document.createElement('summary');
    const failed = comparison.results.some(result => !result.passed);
    title.className = failed ? 'fail' : 'pass';
    title.textContent = `${failed ? t.fail : t.pass} · ${comparison.label}`;
    section.append(title);
    for (const result of comparison.results) {
      const line = document.createElement('p');
      line.className = result.passed ? 'pass' : 'fail';
      line.textContent = `${result.passed ? t.pass : t.fail} · ${result.category}`;
      section.append(line);
      if (result.error) {
        const error = document.createElement('pre');
        error.textContent = result.error;
        section.append(error);
      }
    }
    details.append(section);
  }
  for (const stage of evidence.stages) {
    const html = document.createElement('details');
    const title = document.createElement('summary');
    title.textContent = `${stage.route}/${stage.stage}.html`;
    const pre = document.createElement('pre');
    pre.textContent = stage.html;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${stage.route}-${stage.stage}.html`;
    button.onclick = () => download(button.textContent, stage.html, 'text/html');
    html.append(title, button, pre);
    details.append(html);
  }
  container.append(details);
}
