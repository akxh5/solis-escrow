package com.solisescrow.indexer.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "indexer_state")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class IndexerState {

    @Id
    @Column(name = "id")
    private Integer id = 1;

    @Column(name = "last_processed_ledger", nullable = false)
    private Integer lastProcessedLedger = 0;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
