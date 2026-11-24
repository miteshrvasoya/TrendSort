import { runSeed } from "./seed";
runSeed()
  .then((n) => console.log(`seed complete (${n} sample trends added)`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
