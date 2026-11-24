export declare class G2P {
  constructor(dict?: Record<string, string>)
  setDictionary(dict: Record<string, string>): void
  convert(text: string): string
}
