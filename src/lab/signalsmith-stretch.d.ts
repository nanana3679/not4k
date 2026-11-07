// signalsmith-stretch 1.3.x는 타입 선언을 싣지 않는다. 옵저버 감속 Lab이 쓰는 부분만 README와 패키지 소스 기준으로 선언한다.
declare module "signalsmith-stretch" {
  export interface SignalsmithStretchChange {
    /**
     * 이 변경이 들리는 AudioContext 시각(초). 처리기는 출력 지연만큼 앞서 이 시각의 소리를 계산하므로,
     * 출력 지연보다 늦게 도착한 변경은 이미 계산한 소리에 들어가지 않는다. 버퍼 재생의 입력 지연은 처리기가 버퍼를 앞서 읽어 메운다.
     */
    output?: number;
    active?: boolean;
    /** 올린 버퍼 안의 입력 위치(초). 생략하면 직전 구간에서 이어지는 위치. */
    input?: number;
    rate?: number;
    semitones?: number;
  }

  /** 처리기가 시간표에 넣은 변경. output을 생략했으면 처리기가 채운 시각이 들어 있다. */
  export interface SignalsmithScheduledChange extends SignalsmithStretchChange {
    output: number;
  }

  export interface SignalsmithStretchNode extends AudioWorkletNode {
    inputTime: number;
    /** 변경을 예약한다. 처리기 currentTime 이후로 잡혀 있던 예약은 모두 지운다(패키지 소스 기준). */
    schedule(change: SignalsmithStretchChange): Promise<SignalsmithScheduledChange>;
    /** 인자가 없으면 처리기 currentTime + 출력 지연에 입력 0초부터 재생을 예약하고 그 변경을 돌려준다. */
    start(): Promise<SignalsmithScheduledChange>;
    /** 인자가 없으면 처리기 currentTime에 정지를 예약하고 그 변경을 돌려준다. */
    stop(): Promise<SignalsmithScheduledChange>;
    addBuffers(channels: Float32Array[], transfer?: Transferable[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number }>;
    /** 입력 지연 + 출력 지연(초). README는 live input 기준 지연이라고 적는다. */
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
