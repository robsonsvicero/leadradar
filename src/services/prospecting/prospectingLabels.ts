export type LeadClassification = 'hot' | 'warm' | 'cold'

const classificationLabels: Record<LeadClassification, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
}

const segmentLabels: Record<string, string> = {
  accountant: 'Contador',
  accountants: 'Contadores',
  accounting: 'Contabilidade',
  'accounting firm': 'Escritório de contabilidade',
  'accounting firms': 'Escritórios de contabilidade',
  'beauty salon': 'Salão de beleza',
  'beauty salons': 'Salões de beleza',
  'car repair': 'Oficina mecânica',
  'car repair and maintenance': 'Oficina mecânica',
  'car repair and maintenance service': 'Oficina mecânica',
  cafe: 'Café',
  'dental clinic': 'Clínica odontológica',
  'dental clinics': 'Clínicas odontológicas',
  dentist: 'Dentista',
  dentists: 'Dentistas',
  doctor: 'Médico',
  doctors: 'Médicos',
  gym: 'Academia',
  gyms: 'Academias',
  hotel: 'Hotel',
  hotels: 'Hotéis',
  hospital: 'Hospital',
  hospitals: 'Hospitais',
  lawyer: 'Advogado',
  lawyers: 'Advogados',
  'law firm': 'Escritório de advocacia',
  'law firms': 'Escritórios de advocacia',
  'medical clinic': 'Clínica médica',
  'medical clinics': 'Clínicas médicas',
  'real estate agency': 'Imobiliária',
  'real estate agencies': 'Imobiliárias',
  restaurant: 'Restaurante',
  restaurants: 'Restaurantes',
  'real estate agent': 'Corretor de imóveis',
  'real estate agents': 'Corretores de imóveis',
  school: 'Escola',
  schools: 'Escolas',
  store: 'Loja',
  stores: 'Lojas',
  'veterinary care': 'Clínica veterinária',
  'veterinary clinics': 'Clínicas veterinárias',
  veterinarian: 'Veterinário',
  veterinarians: 'Veterinários',
}

export function getClassificationLabel(classification: LeadClassification) {
  return classificationLabels[classification]
}

export function getSegmentLabel(segment: string | null | undefined) {
  const value = segment?.trim()
  if (!value) return ''
  return segmentLabels[value.toLocaleLowerCase('pt-BR')] ?? value
}
