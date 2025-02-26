export type ConfigFile = {
  /**
   * The meta-schema URI.
   */
  $schema?: string;
  /**
   * Specify the configuration for individual slides using the slide number as the key.
   */
  slides?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[1-9][0-9]*$".
     */
    [k: `${number}`]: {
      /**
       * Speaker notes.
       */
      speakerNotes?: string;
    };
  };
};
