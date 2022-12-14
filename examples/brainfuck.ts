/*
 * This is a proof of concept to model a simple known Turing-complete system: a Brainfuck
 * interpreter. It's not a very useful use of St4t3! You don't need a state machine to model
 * Brainfuck, you just need loops and a switch statement. The only purpose here is as an example of
 * modeling Turing-complete behavior.
 */

import * as create from "../index";

type Messages = {
  pointerIncrement(): void;
  pointerDecrement(): void;
  valIncrement(): void;
  valDecrement(): void;
  beginLoop(): void;
  endLoop(): void;
  readByte(): void;
  writeByte(): void;
  finish(): void;
  nextInstruction(): void;
};

type Props = {
  pointer: number,
  bytes: number[],
  input: string[],
  output: string[],
  instruction: number,
  instructions: string[],
};

type HaltStates = "Success"
                | "Segfault"
                | "InsufficientInput"
                | "SyntaxError"
                ;
const Running = create.transition<HaltStates | "Running", Messages, Props>().build(state => {
  const props = state.props;

  return state.build({
    messages: goto => state.msg({
      pointerIncrement() {
        props.pointer++;
        if(props.pointer >= props.bytes.length) props.bytes.push(0);
      },
      pointerDecrement() {
        props.pointer--;
        if(props.pointer < 0) goto("Segfault");
      },
      valIncrement() {
        props.bytes[props.pointer]++;
      },
      valDecrement() {
        props.bytes[props.pointer]--;
      },
      readByte() {
        const byte = props.input.shift();
        if(!byte) {
          goto("InsufficientInput");
          return;
        }

        props.bytes[props.pointer] = byte.charCodeAt(0);
      },
      writeByte() {
        props.output.push(String.fromCharCode(props.bytes[props.pointer]));
      },
      beginLoop() {
        const byte = props.bytes[props.pointer];
        if(byte !== 0) return;

        let openCount = 1;
        for(
          let command = props.instructions[++props.instruction];
          !(openCount === 1 && command === "]");
          command = props.instructions[++props.instruction]
        ) {
          if(command === "[") openCount++;
          else if(command === "]") openCount--;
        }
      },
      endLoop() {
        const byte = props.bytes[props.pointer];
        if(byte === 0) return;

        let closeCount = 1;
        for(
          let command = props.instructions[--props.instruction];
          !(closeCount === 1 && command === "[");
          command = props.instructions[--props.instruction]
        ) {
          if(command === undefined) {
            goto("SyntaxError");
            return;
          }
          if(command === "]") closeCount++;
          else if(command === "[") closeCount--;
        }
      },
      finish() {
        goto("Success");
      },
      nextInstruction() {
        goto("Running", {
          instruction: state.props.instruction + 1,
        });
      },
    }),
  });
});

const Success = create.transition().build();
const Segfault = create.transition().build();
const InsufficientInput = create.transition().build();
const SyntaxError = create.transition().build();

const machine = create.machine<Messages, Props>().build({
  initial: "Running",
  states: { Running, Success, Segfault, InsufficientInput, SyntaxError },
  props: {
    pointer: 0,
    bytes: [ 0 ],
    loopback: [] as number[],
    instruction: 0,
  },
});

export function brainfuck(program: string, input: string[]) {
  const output: string[] = [];
  machine.start({
    input,
    output,
    instructions: program.split(""),
  });

  while(machine.current() === "Running" && machine.props().instruction < program.length) {
    const props = machine.props();
    const command = props.instructions[props.instruction];
    switch(command) {
      case '>':
        machine.dispatch('pointerIncrement');
        break;
      case '<':
        machine.dispatch('pointerDecrement');
        break;
      case '+':
        machine.dispatch('valIncrement');
        break;
      case '-':
        machine.dispatch('valDecrement');
        break;
      case '.':
        machine.dispatch('writeByte');
        break;
      case ',':
        machine.dispatch('readByte');
        break;
      case '[':
        machine.dispatch('beginLoop');
        break;
      case ']':
        machine.dispatch('endLoop');
        break;
      default:
        // Brainfuck is specified to ignore unknown characters; so, do nothing
    }
    machine.dispatch("nextInstruction");
  }
  machine.dispatch("finish");

  return [machine.current(), output];
}

// Test with a hello world program
const ret = brainfuck(
  `++++++++
   [>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]
   >>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.`,
  []
);

console.log(ret);
