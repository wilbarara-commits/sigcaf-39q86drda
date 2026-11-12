import { memo, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'

/**
 * Catálogo unificado de escolas do modal "Atribuir Escolas" (/rotas).
 * Otimização 0.0.282: componente memoizado (React.memo) com linha também
 * memoizada — marcar/desmarcar uma escola re-renderiza apenas a linha
 * alterada, não a página (cards de rota, paradas, mapas, listas de pedidos).
 *
 * O mapa escola→rota ("está em outra rota") é pré-calculado UMA vez na página
 * (useMemo mapaEscolaOutraRota) e repassado pronto; o callback de toggle é
 * estável (useCallback). Comportamento idêntico ao inline anterior: mesmos
 * dados exibidos, mesmas ações, mesmo resultado ao salvar.
 */

export interface EscolaCatalogoItem {
  escolaId: string
  escolaNome?: string | null
  escolaEndereco?: string | null
  escolaAlunos?: number | null
  contratoNumero?: string | null
}

export interface MapaEscolaOutraRota {
  [escolaId: string]: { rotaId: string; rotaNome: string } | undefined
}

interface RoutingSchoolListProps {
  escolas: EscolaCatalogoItem[]
  selecionadas: string[]
  mapaEscolaRota: MapaEscolaOutraRota
  onToggle: (escolaId: string, marcada: boolean) => void
}

interface RoutingSchoolRowProps {
  escola: EscolaCatalogoItem
  isChecked: boolean
  outraRotaNome: string | null
  onToggle: (escolaId: string, marcada: boolean) => void
}

const RoutingSchoolRow = memo(function RoutingSchoolRow({
  escola,
  isChecked,
  outraRotaNome,
  onToggle,
}: RoutingSchoolRowProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onToggle(escola.escolaId, e.target.checked)
    },
    [onToggle, escola.escolaId],
  )

  return (
    <label
      className={`flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer text-xs transition-colors ${
        isChecked ? 'bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={handleChange}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-foreground text-sm">{escola.escolaNome || 'Escola'}</p>
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 font-mono text-muted-foreground border-border"
              title={`Contrato de origem: ${escola.contratoNumero}`}
            >
              {escola.contratoNumero}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {escola.escolaEndereco || 'Endereço não informado'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {escola.escolaAlunos !== undefined && escola.escolaAlunos !== null && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            {escola.escolaAlunos} alunos
          </Badge>
        )}
        {outraRotaNome !== null && !isChecked && (
          <Badge
            variant="outline"
            className="text-[10px] text-amber-700 bg-amber-50 border-amber-300"
          >
            Atualmente na {outraRotaNome}
          </Badge>
        )}
      </div>
    </label>
  )
})

export const RoutingSchoolList = memo(function RoutingSchoolList({
  escolas,
  selecionadas,
  mapaEscolaRota,
  onToggle,
}: RoutingSchoolListProps) {
  // Set de seleção: evita includes() linear por linha a cada render.
  const selecionadasSet = useMemo(() => new Set(selecionadas), [selecionadas])

  if (escolas.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        Nenhuma escola encontrada para a chamada selecionada.
      </div>
    )
  }

  return (
    <>
      {escolas.map((esc) => {
        const outraRotaObj = mapaEscolaRota[esc.escolaId]
        return (
          <RoutingSchoolRow
            key={esc.escolaId}
            escola={esc}
            isChecked={selecionadasSet.has(esc.escolaId)}
            outraRotaNome={outraRotaObj ? outraRotaObj.rotaNome : null}
            onToggle={onToggle}
          />
        )
      })}
    </>
  )
})
