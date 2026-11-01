// signalsmith-stretch 1.3.x는 타입 선언을 싣지 않는다. 옵저버 감속 Lab이 쓰는 부분만 README 기준으로 선언한다.
declare module "signalsmith-stretch" {
  export interface SignalsmithStretchChange {
    /** 이 변경이 들리는 AudioContext 시각(초). 노드가 자기 지연을 보정한다. */
    output?: number;
    active?: boolean;
    /** 올린 버퍼 안의 입력 위치(초). */
    input?: number;
    rate?: number;
    semitones?: number;
  }

  export interface SignalsmithStretchNode extends AudioWorkletNode {
    inputTime: number;
    schedule(change: SignalsmithStretchChange): Promise<SignalsmithStretchChange>;
    addBuffers(channels: Float32Array[], transfer?: Transferable[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number }>;
    /** 입력 지연 + 출력 지연(초). */
    latency(): Promise<number>;
  }

  interface SignalsmithStretchFactory {
    (context: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<SignalsmithStretchNode>;
    /** 지정하면 blob: 대신 이 주소로 AudioWorklet 모듈을 읽는다. */
    moduleUrl?: string;
  }

  const SignalsmithStretch: SignalsmithStretchFactory;
  export default SignalsmithStretch;
}
