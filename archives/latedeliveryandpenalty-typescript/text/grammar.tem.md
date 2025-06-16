Late Delivery and Penalty – {{% return now.toLocaleString() %}}
----

In case of delayed delivery{{#if forceMajeure}}, except for Force Majeure cases,{{/if}} the Seller shall pay to the Buyer for every _{{% return `${penaltyDuration.amount} ${penaltyDuration.unit}` %}} of delay_ ***Penalty*** amounting to {{penaltyPercentage}}% of the total value of the Equipment whose delivery has been delayed.

1. Any fractional part of a {{fractionalPart}} is to be considered a full {{fractionalPart}}.
1. The total amount of penalty shall not however, exceed {{capPercentage}}% of the total value of the Equipment involved in late delivery.
1. If the delay is more than {{% return `${termination.amount} ${termination.unit}` %}}, the Buyer is entitled to terminate this Contract.
