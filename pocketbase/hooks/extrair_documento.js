// Hook para extração de texto estruturado de documentos (DOCX, PDF, etc.) via $documents.toMarkdown
// POST /backend/v1/documentos/extrair-texto
// Body multipart com campo 'arquivo'

routerAdd('POST', '/backend/v1/documentos/extrair-texto', (e) => {
  const files = e.findUploadedFiles('arquivo')
  if (!files || files.length === 0) {
    throw new BadRequestError('Nenhum arquivo enviado.')
  }

  try {
    const res = $documents.toMarkdown({ file: files[0] })
    return e.json(200, {
      markdown: res.markdown || '',
      truncated: Boolean(res.truncated),
    })
  } catch (err) {
    if (err && err.status === 422) {
      throw new BadRequestError(
        'Não foi possível ler o texto do documento: ' + (err.message || 'formato ilegível'),
      )
    }
    if (err && err.status === 413) {
      throw new BadRequestError('Arquivo muito grande. O limite é de 10 MB.')
    }
    throw err
  }
})
